import mongoose from "mongoose";

const ChatMessageSchema = new mongoose.Schema({
  roomCode: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  text: { type: String, required: true },
  kind: {
    type: String,
    enum: ["chat", "system", "guess"],
    default: "chat",
  },
  createdAt: { type: Date, default: Date.now },
});

ChatMessageSchema.index({ roomCode: 1, createdAt: -1 });

export const ChatMessage =
  mongoose.models.ChatMessage || mongoose.model("ChatMessage", ChatMessageSchema);
