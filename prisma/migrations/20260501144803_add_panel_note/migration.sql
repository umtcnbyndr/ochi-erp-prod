-- CreateTable
CREATE TABLE "PanelNote" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "PanelNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PanelNote_userId_done_idx" ON "PanelNote"("userId", "done");

-- CreateIndex
CREATE INDEX "PanelNote_userId_pinned_createdAt_idx" ON "PanelNote"("userId", "pinned", "createdAt");

-- AddForeignKey
ALTER TABLE "PanelNote" ADD CONSTRAINT "PanelNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
