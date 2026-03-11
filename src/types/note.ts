export type NoteType = 'note' | 'excerpt' | 'annotation';

export interface NoteItem {
  id: string;
  paper_id: string;
  note_type: NoteType;
  content: string;
  selected_text?: string;
  page_number?: number;
  comment?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateNoteInput {
  paper_id: string;
  note_type: NoteType;
  content: string;
  selected_text?: string;
  page_number?: number;
  comment?: string;
}
