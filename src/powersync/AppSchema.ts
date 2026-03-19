import { column, Schema, Table } from "@powersync/react-native";

const thoughts = new Table({
  content: column.text,
  created_at: column.text,
  created_by: column.text,
});

const reactions = new Table(
  {
    thought_id: column.text,
    user_id: column.text,
    emoji: column.text,
    created_at: column.text,
  },
  { indexes: { thought: ["thought_id"] } }
);

const dead_letter = new Table(
  {
    target_table: column.text,
    row_id: column.text,
    op_type: column.text,
    op_data: column.text,
    error_message: column.text,
    retry_count: column.integer,
    original_client_id: column.integer,
    created_at: column.text,
  },
  { localOnly: true }
);

export const AppSchema = new Schema({ thoughts, reactions, dead_letter });

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

export type DeadLetterRecord = {
  id: string;
  target_table: string;
  row_id: string;
  op_type: string;
  op_data: string;
  error_message: string;
  retry_count: number;
  original_client_id: number;
  created_at: string;
};
