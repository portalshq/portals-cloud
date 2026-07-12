import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const capabilityStatusEnum = pgEnum("capability_status", [
  "shipped",
  "beta",
  "proposed",
]);

export const capabilitiesTable = pgTable("capabilities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  status: capabilityStatusEnum("status").notNull().default("proposed"),
  votes: integer("votes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCapabilitySchema = createInsertSchema(
  capabilitiesTable,
).omit({ id: true, createdAt: true, votes: true });
export type InsertCapability = z.infer<typeof insertCapabilitySchema>;
export type Capability = typeof capabilitiesTable.$inferSelect;

export const capabilityVotesTable = pgTable(
  "capability_votes",
  {
    id: serial("id").primaryKey(),
    capabilityId: integer("capability_id")
      .notNull()
      .references(() => capabilitiesTable.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("capability_votes_capability_id_client_id_idx").on(
      table.capabilityId,
      table.clientId,
    ),
  ],
);

export type CapabilityVote = typeof capabilityVotesTable.$inferSelect;

export const capabilityCommentsTable = pgTable("capability_comments", {
  id: serial("id").primaryKey(),
  capabilityId: integer("capability_id")
    .notNull()
    .references(() => capabilitiesTable.id, { onDelete: "cascade" }),
  authorName: text("author_name"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCapabilityCommentSchema = createInsertSchema(
  capabilityCommentsTable,
).omit({ id: true, createdAt: true });
export type InsertCapabilityComment = z.infer<
  typeof insertCapabilityCommentSchema
>;
export type CapabilityComment = typeof capabilityCommentsTable.$inferSelect;
