-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "client" TEXT NOT NULL DEFAULT '',
    "draftJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMaterialItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "description" TEXT NOT NULL,
    "vendor" TEXT,
    "category" "MaterialCategory" NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMaterialItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectLaborTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sheet" "LaborSheet" NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minutesPerUnit" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "laborRole" "LaborRoleName" NOT NULL,
    "includedInSubtotal" BOOLEAN NOT NULL DEFAULT true,
    "derivedFromJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectLaborTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectLaborRate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" "LaborRoleName" NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL,
    "rawWageRate" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectLaborRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCrewSizeRow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "technicianCount" INTEGER NOT NULL,
    "cmsNeeded" INTEGER NOT NULL,

    CONSTRAINT "ProjectCrewSizeRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectLaborProjectionSettings" (
    "projectId" TEXT NOT NULL,
    "hoursPerManDay" DOUBLE PRECISION NOT NULL,
    "hoursPerManWeek" DOUBLE PRECISION NOT NULL,
    "stagingMaterialMultiplier" DOUBLE PRECISION NOT NULL,
    "cmPercentOfTechHours" DOUBLE PRECISION NOT NULL,
    "pmPercentOfTechHours" DOUBLE PRECISION NOT NULL,
    "coordinatorPercentOfTechHours" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectLaborProjectionSettings_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "ProjectPassThroughRoleRate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "PassThroughRateKind" NOT NULL,
    "role" "LaborRoleName" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProjectPassThroughRoleRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRentalRate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "ProjectRentalRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSoftCostRate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProjectSoftCostRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEstimateDefaults" (
    "projectId" TEXT NOT NULL,
    "laborMarkupPct" DOUBLE PRECISION NOT NULL,
    "passThroughMarkupPct" DOUBLE PRECISION NOT NULL,
    "materialMarkupPct" DOUBLE PRECISION NOT NULL,
    "corporateMarkupPct" DOUBLE PRECISION NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL,
    "contingencyPct" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectEstimateDefaults_pkey" PRIMARY KEY ("projectId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMaterialItem_projectId_key_key" ON "ProjectMaterialItem"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectLaborTask_projectId_key_key" ON "ProjectLaborTask"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectLaborRate_projectId_role_key" ON "ProjectLaborRate"("projectId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCrewSizeRow_projectId_technicianCount_key" ON "ProjectCrewSizeRow"("projectId", "technicianCount");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPassThroughRoleRate_projectId_kind_role_key" ON "ProjectPassThroughRoleRate"("projectId", "kind", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRentalRate_projectId_key_key" ON "ProjectRentalRate"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSoftCostRate_projectId_key_key" ON "ProjectSoftCostRate"("projectId", "key");

-- AddForeignKey
ALTER TABLE "ProjectMaterialItem" ADD CONSTRAINT "ProjectMaterialItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLaborTask" ADD CONSTRAINT "ProjectLaborTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLaborRate" ADD CONSTRAINT "ProjectLaborRate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCrewSizeRow" ADD CONSTRAINT "ProjectCrewSizeRow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLaborProjectionSettings" ADD CONSTRAINT "ProjectLaborProjectionSettings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPassThroughRoleRate" ADD CONSTRAINT "ProjectPassThroughRoleRate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRentalRate" ADD CONSTRAINT "ProjectRentalRate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSoftCostRate" ADD CONSTRAINT "ProjectSoftCostRate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEstimateDefaults" ADD CONSTRAINT "ProjectEstimateDefaults_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
