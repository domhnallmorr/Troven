import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument, PDFArray, PDFName, decodePDFRawStream } from 'pdf-lib'
import createQpdf from '@neslinesli93/qpdf-wasm'
import { getPdfPageCount, extractPdfPages, mergePdfFiles } from './pdfUtils.cjs'

const directories = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function fixture({ bits, password = '' } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'troven-pdf-test-'))
  directories.push(dir)
  const document = await PDFDocument.create()
  document.addPage([300, 400]).drawText('First page content')
  document.addPage([500, 600]).drawText('Second page content')
  const plain = await document.save()
  let bytes = plain
  if (bits) {
    const qpdf = await createQpdf({ print: () => {}, printErr: () => {} })
    qpdf.FS.writeFile('/plain.pdf', plain)
    const code = qpdf.callMain([
      '/plain.pdf', '--encrypt', password, 'owner-secret', String(bits),
      ...(bits === 128 ? ['--use-aes=y'] : []),
      '--modify=none', '--', '/encrypted.pdf',
    ])
    expect(code).toBe(0)
    bytes = qpdf.FS.readFile('/encrypted.pdf')
  }
  const source = path.join(dir, 'source.pdf')
  const output = path.join(dir, 'output.pdf')
  await fs.writeFile(source, bytes)
  return { source, output, bytes, plain }
}

function pageContent(document, index) {
  const contents = document.getPage(index).node.lookup(PDFName.of('Contents'))
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents]
  return streams.map((ref) => Buffer.from(decodePDFRawStream(document.context.lookup(ref)).decode()).toString()).join('')
}

describe('PDF tools', () => {
  it.each([undefined, 128, 256])('counts and extracts readable pages (encryption bits: %s)', async (bits) => {
    const { source, output, bytes, plain } = await fixture({ bits })
    if (bits) await expect(PDFDocument.load(bytes)).rejects.toThrow('encrypted')
    expect(await getPdfPageCount(source)).toBe(2)
    await extractPdfPages(source, output, 2, 2)
    const extracted = await PDFDocument.load(await fs.readFile(output))
    expect(extracted.getPageCount()).toBe(1)
    expect(extracted.isEncrypted).toBe(false)
    expect(extracted.getPage(0).getSize()).toEqual({ width: 500, height: 600 })
    expect(pageContent(extracted, 0)).toBe(pageContent(await PDFDocument.load(plain), 1))
    expect(await fs.readFile(source)).toEqual(Buffer.from(bytes))
  })

  it('merges encrypted and plain sources in order', async () => {
    const encrypted = await fixture({ bits: 256 })
    const plain = await fixture()
    await mergePdfFiles([encrypted.source, plain.source], encrypted.output)
    const merged = await PDFDocument.load(await fs.readFile(encrypted.output))
    expect(merged.getPageCount()).toBe(4)
    const original = await PDFDocument.load(plain.plain)
    for (let i = 0; i < 4; i++) expect(pageContent(merged, i)).toBe(pageContent(original, i % 2))
  })

  it('explains opening-password protection without writing output', async () => {
    const { source, output } = await fixture({ bits: 256, password: 'opening-secret' })
    await expect(getPdfPageCount(source)).rejects.toThrow('opening password')
    await expect(extractPdfPages(source, output, 1, 1)).rejects.toThrow('opening password')
    await expect(mergePdfFiles([source], output)).rejects.toThrow('opening password')
    await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves sources and validates page ranges', async () => {
    const { source, output, bytes } = await fixture()
    await expect(extractPdfPages(source, source, 1, 1)).rejects.toThrow('different output file')
    await expect(mergePdfFiles([source], source)).rejects.toThrow('different output file')
    await expect(extractPdfPages(source, output, 0, 1)).rejects.toThrow('Invalid page range')
    await expect(extractPdfPages(source, output, 1, 3)).rejects.toThrow('exceeds PDF page count')
    expect(await fs.readFile(source)).toEqual(Buffer.from(bytes))
    await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects malformed input without writing output', async () => {
    const { source, output } = await fixture()
    await fs.writeFile(source, 'not a PDF')
    await expect(getPdfPageCount(source)).rejects.toThrow()
    await expect(extractPdfPages(source, output, 1, 1)).rejects.toThrow()
    await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
