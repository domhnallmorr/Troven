const fs = require('node:fs/promises')
const path = require('node:path')
const { Worker } = require('node:worker_threads')
const { PDFDocument, EncryptedPDFError } = require('pdf-lib')

// Use a worker so QPDF's synchronous WASM processing cannot block Electron.
function decryptPdf(bytes) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'pdfDecryptWorker.cjs'), { workerData: bytes })
    let received = false
    worker.once('message', (result) => {
      received = true
      if (result.error) reject(new Error(result.error))
      else resolve(result.bytes)
    })
    worker.once('error', reject)
    worker.once('exit', (code) => {
      if (!received) reject(new Error('PDF decryption worker exited before completing (code ' + code + ').'))
    })
  })
}

async function loadPdf(bytes) {
  try {
    return await PDFDocument.load(bytes)
  } catch (error) {
    // pdf-lib's ES5 Error subclass does not reliably support instanceof.
    if (!(error instanceof EncryptedPDFError) && error.message !== new EncryptedPDFError().message) throw error
    // Empty-password encryption is common on PDFs with editing restrictions.
    // ignoreEncryption only skips a check; it does not decrypt page content.
    return PDFDocument.load(await decryptPdf(bytes))
  }
}

async function requireSeparateOutput(sourcePaths, outputPath) {
  const outputStat = await fs.stat(outputPath).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  for (const sourcePath of sourcePaths) {
    const sourceStat = await fs.stat(sourcePath)
    if (path.resolve(sourcePath) === path.resolve(outputPath) ||
        (outputStat && sourceStat.dev === outputStat.dev && sourceStat.ino === outputStat.ino)) {
      throw new Error('Choose a different output file to preserve the original PDF and any digital signatures.')
    }
  }
}

async function getPdfPageCount(pdfPath) {
  const pdfBytes = await fs.readFile(pdfPath)
  const pdfDocument = await loadPdf(pdfBytes)
  return pdfDocument.getPageCount()
}

async function extractPdfPages(sourcePath, outputPath, startPage, endPage) {
  const firstPage = Number(startPage)
  const lastPage = Number(endPage)

  if (!sourcePath || !outputPath) {
    throw new Error('Source and output PDF paths are required.')
  }

  if (!Number.isInteger(firstPage) || !Number.isInteger(lastPage) || firstPage < 1 || lastPage < firstPage) {
    throw new Error('Invalid page range.')
  }

  await requireSeparateOutput([sourcePath], outputPath)
  const sourceBytes = await fs.readFile(sourcePath)
  const sourceDocument = await loadPdf(sourceBytes)
  const pageCount = sourceDocument.getPageCount()

  if (lastPage > pageCount) {
    throw new Error(`Page range exceeds PDF page count (${pageCount}).`)
  }

  const outputDocument = await PDFDocument.create()
  const pageIndexes = Array.from({ length: lastPage - firstPage + 1 }, (_value, index) => firstPage - 1 + index)
  const copiedPages = await outputDocument.copyPages(sourceDocument, pageIndexes)

  for (const page of copiedPages) {
    outputDocument.addPage(page)
  }

  const outputBytes = await outputDocument.save()
  await fs.writeFile(outputPath, outputBytes)
  return outputPath
}

async function mergePdfFiles(sourcePaths, outputPath) {
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    throw new Error('At least one PDF path is required.')
  }

  if (!outputPath) {
    throw new Error('Output PDF path is required.')
  }

  await requireSeparateOutput(sourcePaths, outputPath)
  const outputDocument = await PDFDocument.create()

  for (const sourcePath of sourcePaths) {
    const pdfBytes = await fs.readFile(sourcePath)
    const sourceDocument = await loadPdf(pdfBytes)
    const copiedPages = await outputDocument.copyPages(
      sourceDocument,
      sourceDocument.getPageIndices(),
    )

    for (const page of copiedPages) {
      outputDocument.addPage(page)
    }
  }

  const outputBytes = await outputDocument.save()
  await fs.writeFile(outputPath, outputBytes)
  return outputPath
}

module.exports = { getPdfPageCount, extractPdfPages, mergePdfFiles }
