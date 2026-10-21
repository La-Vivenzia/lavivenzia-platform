-- CreateIndex
CREATE INDEX "experiences_title_idx" ON "experiences" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "experiences_summary_idx" ON "experiences" USING GIN ("summary" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "experiences_city_idx" ON "experiences" USING GIN ("city" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "hosts_display_name_idx" ON "hosts" USING GIN ("display_name" gin_trgm_ops);
