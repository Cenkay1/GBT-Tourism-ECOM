-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "reminderSentAt" DATETIME;

-- CreateTable
CREATE TABLE "TourPlace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tourId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "mapQuery" TEXT,
    "nights" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TourPlace_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
