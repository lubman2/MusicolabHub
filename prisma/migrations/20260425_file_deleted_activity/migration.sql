-- Add file_deleted to ActivityAction enum so soft-deletes can be logged in the
-- project activity feed alongside file_uploaded.
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'file_deleted' AFTER 'file_uploaded';
