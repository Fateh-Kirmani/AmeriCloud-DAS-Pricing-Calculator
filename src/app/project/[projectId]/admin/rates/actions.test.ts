import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createProject } from '@/lib/project/createProject';
import { updateProjectLaborRate, updateProjectCrewSizeRow, updateProjectLaborProjectionSettings } from './actions';

describe('project rates admin actions (integration — requires a live, seeded local Postgres)', () => {
  const projectIds: string[] = [];

  afterEach(async () => {
    for (const id of projectIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  it('updates a labor rate without affecting a different project', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const rateA = await prisma.projectLaborRate.findUnique({
      where: { projectId_role: { projectId: projectA, role: 'Technician' } },
    });
    const rateB = await prisma.projectLaborRate.findUnique({
      where: { projectId_role: { projectId: projectB, role: 'Technician' } },
    });

    const result = await updateProjectLaborRate(projectA, rateA!.id, { hourlyRate: '999', rawWageRate: '888' });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectLaborRate.findUnique({ where: { id: rateA!.id } });
    expect(updatedA).toMatchObject({ hourlyRate: 999, rawWageRate: 888 });

    const untouchedB = await prisma.projectLaborRate.findUnique({ where: { id: rateB!.id } });
    expect(untouchedB!.hourlyRate).not.toBe(999);
  });

  it('rejects updating a labor rate with a mismatched projectId/id pair, leaving the row unchanged', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const rateA = await prisma.projectLaborRate.findUnique({
      where: { projectId_role: { projectId: projectA, role: 'Technician' } },
    });
    const originalHourlyRate = rateA!.hourlyRate;

    const result = await updateProjectLaborRate(projectB, rateA!.id, { hourlyRate: '500', rawWageRate: '400' });
    expect(result.error).toMatch(/not found/);

    const untouchedA = await prisma.projectLaborRate.findUnique({ where: { id: rateA!.id } });
    expect(untouchedA!.hourlyRate).toBe(originalHourlyRate);
  });

  it('rejects a negative hourly rate', async () => {
    const { id: projectId } = await createProject();
    projectIds.push(projectId);
    const rate = await prisma.projectLaborRate.findUnique({
      where: { projectId_role: { projectId, role: 'Technician' } },
    });

    const result = await updateProjectLaborRate(projectId, rate!.id, { hourlyRate: '-5', rawWageRate: '10' });
    expect(result.error).toMatch(/non-negative/);
  });

  it('updates a crew-size row without affecting a different project', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const rowA = await prisma.projectCrewSizeRow.findUnique({
      where: { projectId_technicianCount: { projectId: projectA, technicianCount: 4 } },
    });
    const rowB = await prisma.projectCrewSizeRow.findUnique({
      where: { projectId_technicianCount: { projectId: projectB, technicianCount: 4 } },
    });

    const result = await updateProjectCrewSizeRow(projectA, rowA!.id, { cmsNeeded: '9' });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectCrewSizeRow.findUnique({ where: { id: rowA!.id } });
    expect(updatedA!.cmsNeeded).toBe(9);

    const untouchedB = await prisma.projectCrewSizeRow.findUnique({ where: { id: rowB!.id } });
    expect(untouchedB!.cmsNeeded).not.toBe(9);
  });

  it('rejects updating a crew-size row with a mismatched projectId/id pair, leaving the row unchanged', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const rowA = await prisma.projectCrewSizeRow.findUnique({
      where: { projectId_technicianCount: { projectId: projectA, technicianCount: 4 } },
    });
    const originalCmsNeeded = rowA!.cmsNeeded;

    const result = await updateProjectCrewSizeRow(projectB, rowA!.id, { cmsNeeded: '99' });
    expect(result.error).toMatch(/not found/);

    const untouchedA = await prisma.projectCrewSizeRow.findUnique({ where: { id: rowA!.id } });
    expect(untouchedA!.cmsNeeded).toBe(originalCmsNeeded);
  });

  it('updates labor projection settings without affecting a different project', async () => {
    const { id: projectA } = await createProject();
    const { id: projectB } = await createProject();
    projectIds.push(projectA, projectB);

    const result = await updateProjectLaborProjectionSettings(projectA, {
      hoursPerManDay: '10', hoursPerManWeek: '50', stagingMaterialMultiplier: '10',
      cmPercentOfTechHours: '60', pmPercentOfTechHours: '30', coordinatorPercentOfTechHours: '20',
    });
    expect(result.error).toBeUndefined();

    const updatedA = await prisma.projectLaborProjectionSettings.findUnique({ where: { projectId: projectA } });
    expect(updatedA).toMatchObject({ hoursPerManDay: 10, hoursPerManWeek: 50 });

    const untouchedB = await prisma.projectLaborProjectionSettings.findUnique({ where: { projectId: projectB } });
    expect(untouchedB!.hoursPerManDay).not.toBe(10);
  });
});
