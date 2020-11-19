const xlsx = require('xlsx');
const stream = require('stream');
const finalizer = require('./finalizer');

const writingWorkbooks = {};

async function saveExcelFiles() {
  for (const file in writingWorkbooks) {
    xlsx.writeFile(writingWorkbooks[file], file);
  }
}

finalizer.register(saveExcelFiles);

function createWorkbook(fileName) {
  let workbook = writingWorkbooks[fileName];
  if (workbook) return workbook;
  workbook = xlsx.utils.book_new();
  writingWorkbooks[fileName] = workbook;
  return workbook;
}

class ExcelSheetWriterStream extends stream.Writable {
  constructor({ fileName, sheetName }) {
    super({ objectMode: true });
    this.rows = [];
    this.structure = null;
    this.fileName = fileName;
    this.sheetName = sheetName;
  }
  _write(chunk, enc, next) {
    if (this.structure) {
      this.rows.push(this.structure.columns.map((col) => chunk[col.columnName]));
    } else {
      this.structure = chunk;
      this.rows.push(chunk.columns.map((x) => x.columnName));
    }

    next();
  }

  _final(callback) {
    const workbook = createWorkbook(this.fileName);
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(this.rows), this.sheetName || 'Sheet 1');
    callback();
  }
}

async function excelSheetWriter({ fileName, sheetName }) {
  return new ExcelSheetWriterStream({
    fileName,
    sheetName,
  });
}

module.exports = excelSheetWriter;