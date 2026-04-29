-- Add gig lifecycle events to ActivityAction enum so the project activity
-- stream reflects marketplace gig actions alongside application/hire events
-- (EPIC-10, MusicolabHub-62g).
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'gig_created' AFTER 'project_deleted';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'gig_published' AFTER 'gig_created';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'gig_closed' AFTER 'gig_published';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'gig_cancelled' AFTER 'gig_closed';
