/*
  Warnings:

  - You are about to drop the column `excerpt` on the `entries` table. All the data in the column will be lost.
  - You are about to drop the column `line_count` on the `entries` table. All the data in the column will be lost.
  - You are about to drop the column `word_count` on the `entries` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "entries" DROP COLUMN "excerpt",
DROP COLUMN "line_count",
DROP COLUMN "word_count";
