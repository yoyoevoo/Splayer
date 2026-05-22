import { pgTable, text, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const songsTable = pgTable("songs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist"),
  // Absolute path to the local cover image file
  localCoverPath: text("local_cover_path"), 
  remoteUrl: text("remote_url"),
});

export const insertSongSchema = createInsertSchema(songsTable).omit({ id: true });
export type Song = typeof songsTable.$inferSelect;
