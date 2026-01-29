import { Schema } from "@powersync/react-native";

// const thoughts = new Table({
//   content: column.text,
//   created_at: column.text,  created_by: column.text,
// });

// const reactions = new Table(
//   {
//     thought_id: column.text,
//     user_id: column.text,
//     emoji: column.text,
//     created_at: column.text,
//   },
//   { indexes: { thought: ["thought_id"] } }
// );

export const AppSchema = new Schema({

})
AppSchema.withRawTables({
  thoughts: {
    put: {
      sql: "INSERT OR REPLACE INTO thoughts (id, content, created_at, created_by) VALUES (?, ?, ?, ?)",
      params: [
        "Id",
        { Column: "content" },
        { Column: "created_at" },
        { Column: "created_by" },
      ],
    },
    delete: {
      sql: "DELETE FROM thoughts WHERE id = ?",
      params: ["Id"],
    },
  },
  reactions: {
    put: {
      sql: "INSERT OR REPLACE INTO reactions (id, thought_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)",
      params: [
        "Id",
        { Column: "thought_id" },
        { Column: "user_id" },
        { Column: "emoji" },
        { Column: "created_at" },
      ],
    },
    delete: {
      sql: "DELETE FROM reactions WHERE id = ?",
      params: ["Id"],
    },
  },
});

export type ThoughtRecord = {
  id: string;
  content: string;
  created_at: string;
  created_by: string;
};

export type ReactionRecord = {
  id: string;
  thought_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};