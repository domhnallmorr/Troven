const { parentPort, workerData } = require('node:worker_threads')
const createQpdf = require('@neslinesli93/qpdf-wasm')

async function decrypt() {
  const qpdf = await createQpdf({
    noInitialRun: true,
    print: () => {},
    printErr: () => {},
  })

  try {
    qpdf.FS.writeFile('/input.pdf', workerData)
    const code = qpdf.callMain(['--password=', '--decrypt', '/input.pdf', '/output.pdf'])
    // QPDF returns 3 for a completed operation with recoverable warnings.
    if (code !== 0 && code !== 3) {
      throw new Error('This PDF could not be decrypted without a password. It may require an opening password or use unsupported encryption. Save an unlocked copy in your PDF application, then try again.')
    }
    const bytes = qpdf.FS.readFile('/output.pdf')
    parentPort.postMessage({ bytes })
  } finally {
    for (const file of ['/input.pdf', '/output.pdf']) {
      try { qpdf.FS.unlink(file) } catch { /* File may not have been created. */ }
    }
  }
}

decrypt().catch((error) => parentPort.postMessage({ error: error.message }))
