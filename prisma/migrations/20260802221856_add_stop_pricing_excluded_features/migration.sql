-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "boardingName" TEXT;

-- AlterTable
ALTER TABLE "TourPlace" ADD COLUMN "price" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tour" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "bookingType" TEXT NOT NULL,
    "departureDate" DATETIME NOT NULL,
    "returnDate" DATETIME,
    "departureLocation" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "coverImage" TEXT NOT NULL,
    "images" TEXT NOT NULL DEFAULT '[]',
    "description" TEXT NOT NULL DEFAULT '',
    "highlights" TEXT NOT NULL DEFAULT '[]',
    "capacity" INTEGER,
    "vehicleType" TEXT,
    "seatLayout" TEXT,
    "seatRows" INTEGER,
    "features" TEXT NOT NULL DEFAULT '[]',
    "excludedFeatures" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'YAYINDA',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Tour" ("bookingType", "capacity", "category", "coverImage", "createdAt", "currency", "departureDate", "departureLocation", "description", "destination", "durationDays", "features", "highlights", "id", "images", "price", "returnDate", "seatLayout", "seatRows", "slug", "status", "title", "vehicleType") SELECT "bookingType", "capacity", "category", "coverImage", "createdAt", "currency", "departureDate", "departureLocation", "description", "destination", "durationDays", "features", "highlights", "id", "images", "price", "returnDate", "seatLayout", "seatRows", "slug", "status", "title", "vehicleType" FROM "Tour";
DROP TABLE "Tour";
ALTER TABLE "new_Tour" RENAME TO "Tour";
CREATE UNIQUE INDEX "Tour_slug_key" ON "Tour"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
