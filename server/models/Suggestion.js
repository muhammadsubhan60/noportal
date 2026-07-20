const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  author:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String },
  text:       { type: String, required: true, maxlength: 1000 },
  createdAt:  { type: Date, default: Date.now },
});

const SuggestionSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  category:    { type: String, enum: ['feature', 'design', 'bug'], required: true },
  imageData:   { type: String }, // base64 data-URL, optional

  status: {
    type: String,
    enum: ['pending', 'under_review', 'planned', 'done', 'declined'],
    default: 'pending',
  },
  isPinned:   { type: Boolean, default: false },
  isApproved: { type: Boolean, default: false },

  author:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String },

  upvotes:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [CommentSchema],

  adminReply: {
    text:      String,
    updatedAt: Date,
  },
}, { timestamps: true });

module.exports = mongoose.model('Suggestion', SuggestionSchema);
