-- Add member_role_changed to ActivityAction enum so role changes can be logged
-- in the project activity feed alongside member_invited and member_removed.
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'member_role_changed' AFTER 'member_removed';
