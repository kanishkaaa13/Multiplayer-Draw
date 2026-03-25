import mongoose from "mongoose";

const DrawOpSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    type: {
      type: String,
      enum: ["stroke", "shape", "fill", "clear"],
      required: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ParticipantSchema = new mongoose.Schema(
  {
    socketId: { type: String, required: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    color: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const RoomSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    title: { type: String, default: "Untitled room" },
    isPrivate: { type: Boolean, default: false },
    passwordHash: { type: String, default: null },
    createdBy: { type: String, default: null },
    /** Serialized drawing ops for late joiners (capped in application logic) */
    drawOps: { type: [DrawOpSchema], default: [] },
    participants: { type: [ParticipantSchema], default: [] },
    game: {
      active: { type: Boolean, default: false },
      word: { type: String, default: "" },
      hint: { type: String, default: "" },
      roundEndsAt: { type: Date, default: null },
      totalEndsAt: { type: Date, default: null },
      roundSeconds: { type: Number, default: 60 },
      drawerUserId: { type: String, default: null },
      drawerName: { type: String, default: "" },
      drawerIndex: { type: Number, default: -1 },
      playerOrder: { type: [String], default: [] },
      guessedUserIds: { type: [String], default: [] },
      scores: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
  },
  { timestamps: true }
);

RoomSchema.methods.trimDrawOps = function trimDrawOps(max = 8000) {
  if (this.drawOps.length > max) {
    this.drawOps = this.drawOps.slice(this.drawOps.length - max);
  }
};

export const Room = mongoose.model("Room", RoomSchema);
