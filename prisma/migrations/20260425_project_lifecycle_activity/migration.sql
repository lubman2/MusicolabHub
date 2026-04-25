-- Add project_restored and project_deleted to ActivityAction enum so the
-- archive/restore/soft-delete lifecycle (02-05) can be logged in the project
-- activity feed alongside project_created and project_archived.
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'project_restored' AFTER 'project_archived';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'project_deleted' AFTER 'project_restored';
