-- Migrate legacy string-array interest tags into the relational tag join table

-- Ensure relational tags exist for every legacy entry
WITH existing_tags AS (
  SELECT DISTINCT UNNEST("interestTags") AS name
  FROM "User"
  WHERE "interestTags" IS NOT NULL
)
INSERT INTO "Tag" ("name")
SELECT name
FROM existing_tags
WHERE name IS NOT NULL AND length(trim(name)) > 0
ON CONFLICT ("name") DO NOTHING;

-- Connect users to their tags before dropping the column
INSERT INTO "_TagToUser" ("A", "B")
SELECT t."id", u."id"
FROM "User" u
CROSS JOIN LATERAL UNNEST(COALESCE(u."interestTags", ARRAY[]::TEXT[])) AS tag_name
JOIN "Tag" t ON t."name" = tag_name
ON CONFLICT DO NOTHING;

-- Remove the old string-array column
ALTER TABLE "User" DROP COLUMN IF EXISTS "interestTags";
