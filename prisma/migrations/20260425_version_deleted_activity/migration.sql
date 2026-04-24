-- Add version_deleted to ActivityAction enum so soft-deletes can be logged in
-- the project activity feed alongside version_published.
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'version_deleted' AFTER 'version_published';
