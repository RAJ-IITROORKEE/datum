-- CreateTable
CREATE TABLE "admin_surveys" (
    "id" TEXT NOT NULL,
    "firmsName" TEXT NOT NULL,
    "founderPrincipal" TEXT NOT NULL,
    "yearOfEstablishment" INTEGER,
    "websiteLink" TEXT,
    "officeAddress" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_surveys_state_idx" ON "admin_surveys"("state");

-- CreateIndex
CREATE INDEX "admin_surveys_city_idx" ON "admin_surveys"("city");

-- CreateIndex
CREATE INDEX "admin_surveys_yearOfEstablishment_idx" ON "admin_surveys"("yearOfEstablishment");
