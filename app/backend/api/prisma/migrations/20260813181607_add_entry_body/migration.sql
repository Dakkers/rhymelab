/*
  Warnings:

  - Added the required column `body` to the `entries` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "entries" ADD COLUMN     "body" TEXT NOT NULL;
