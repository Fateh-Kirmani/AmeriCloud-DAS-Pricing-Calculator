// src/lib/export/materialsWorkbook.test.ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildMaterialsWorkbook } from './materialsWorkbook';
import type { MaterialItem, MaterialLineInput, MaterialLineResult } from '@/lib/calc';

const materialItems: MaterialItem[] = [
  { key: 'c-1', type: 'Cable Tie', manufacturer: 'Panduit', model: 'PLT2S-C0', description: 'Cable tie, 8 inch', vendor: 'Anixter', category: 'Consumable', unitCost: 0.1 },
  { key: 'c-2', type: 'Velcro', manufacturer: null, model: null, description: 'Hook and loop strap', vendor: 'Anixter', category: 'Consumable', unitCost: 2.5 },
  { key: 'd-1', type: 'DC Power Plant', manufacturer: 'Vertiv', model: '582137200', description: 'NetSure 5100', vendor: 'Anixter', category: 'DAS Materials', unitCost: 4685 },
  { key: 'b-1', type: 'Battery', manufacturer: 'Vertiv', model: 'BAT-1', description: 'Backup battery', vendor: 'Anixter', category: 'BAT Materials', unitCost: 500 },
];

async function reload(workbook: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buffer = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  return reloaded;
}

describe('buildMaterialsWorkbook', () => {
  it('includes only Consumable and DAS Materials rows with quantity > 0, each ending with a Total row', async () => {
    const lines: MaterialLineResult[] = [
      { key: 'c-1', extCost: 1, percentOfTotal: 0 },
      { key: 'c-2', extCost: 0, percentOfTotal: 0 },
      { key: 'd-1', extCost: 4685, percentOfTotal: 0 },
      { key: 'b-1', extCost: 500, percentOfTotal: 0 },
    ];
    const quantities: MaterialLineInput[] = [
      { key: 'c-1', quantity: 10 },
      { key: 'c-2', quantity: 0 },
      { key: 'd-1', quantity: 1 },
      { key: 'b-1', quantity: 1 },
    ];

    const workbook = buildMaterialsWorkbook(materialItems, lines, quantities);
    const reloaded = await reload(workbook);

    expect(reloaded.worksheets.map((s) => s.name)).toEqual(['Consumable', 'DAS Materials']);

    const consumableSheet = reloaded.getWorksheet('Consumable')!;
    expect(consumableSheet.getRow(1).getCell(1).value).toBe('TYPE');
    expect(consumableSheet.getRow(2).getCell(1).value).toBe('Cable Tie');
    expect(consumableSheet.getRow(2).getCell(6).value).toBe(1);
    // c-2 has quantity 0, so it's excluded — row 3 is the Total row, not a second item row.
    expect(consumableSheet.getRow(3).getCell(1).value).toBe('Total');
    expect(consumableSheet.getRow(3).getCell(6).value).toBe(1);
  });

  it('joins manufacturer and model with a slash, and omits the separator when both are null', async () => {
    const lines: MaterialLineResult[] = [
      { key: 'c-1', extCost: 1, percentOfTotal: 0 },
      { key: 'c-2', extCost: 25, percentOfTotal: 0 },
    ];
    const quantities: MaterialLineInput[] = [
      { key: 'c-1', quantity: 10 },
      { key: 'c-2', quantity: 10 },
    ];

    const workbook = buildMaterialsWorkbook(materialItems, lines, quantities);
    const reloaded = await reload(workbook);
    const sheet = reloaded.getWorksheet('Consumable')!;
    expect(sheet.getRow(2).getCell(2).value).toBe('Panduit / PLT2S-C0');
    expect(sheet.getRow(3).getCell(2).value).toBe('');
  });

  it('applies a currency number format to Unit Cost and Ext Cost cells, and bold to header/total cells', async () => {
    const lines: MaterialLineResult[] = [{ key: 'd-1', extCost: 9370, percentOfTotal: 0 }];
    const quantities: MaterialLineInput[] = [{ key: 'd-1', quantity: 2 }];

    const workbook = buildMaterialsWorkbook(materialItems, lines, quantities);
    const reloaded = await reload(workbook);
    const sheet = reloaded.getWorksheet('DAS Materials')!;

    expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(sheet.getRow(2).getCell(4).numFmt).toBe('"$"#,##0.00');
    expect(sheet.getRow(2).getCell(6).numFmt).toBe('"$"#,##0.00');

    const totalRow = sheet.getRow(3);
    expect(totalRow.getCell(1).value).toBe('Total');
    expect(totalRow.getCell(1).font?.bold).toBe(true);
    expect(totalRow.getCell(6).value).toBe(9370);
    expect(totalRow.getCell(6).numFmt).toBe('"$"#,##0.00');
  });

  it('skips a category sheet entirely when it has zero qualifying rows', async () => {
    const lines: MaterialLineResult[] = [{ key: 'd-1', extCost: 0, percentOfTotal: 0 }];
    const quantities: MaterialLineInput[] = [{ key: 'd-1', quantity: 0 }];

    const workbook = buildMaterialsWorkbook(materialItems, lines, quantities);
    const reloaded = await reload(workbook);
    expect(reloaded.worksheets.map((s) => s.name)).toEqual([]);
  });

  it('never produces a BAT Materials sheet, even when that category has qualifying rows', async () => {
    const lines: MaterialLineResult[] = [{ key: 'b-1', extCost: 500, percentOfTotal: 0 }];
    const quantities: MaterialLineInput[] = [{ key: 'b-1', quantity: 1 }];

    const workbook = buildMaterialsWorkbook(materialItems, lines, quantities);
    const reloaded = await reload(workbook);
    expect(reloaded.worksheets.map((s) => s.name)).toEqual([]);
  });
});
