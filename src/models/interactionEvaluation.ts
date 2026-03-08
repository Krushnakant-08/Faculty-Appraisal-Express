import mongoose, { Schema, Document } from 'mongoose';
import { DepartmentValue, DEPARTMENT } from '../constant';

// Individual evaluator's marks
interface EvaluatorMarks {
  evaluatorId: string;
  evaluatorName: string;
  knowledge: number;           // Max 20
  skills: number;               // Max 20
  attributes: number;           // Max 10
  outcomesInitiatives: number;  // Max 20
  selfBranching: number;        // Max 10
  teamPerformance: number;      // Max 20
  comments: string;
  totalMarks: number;           // Sum of all marks (Max 100)
  evaluatedAt: Date;
}

export interface InteractionEvaluation extends Document {
  facultyId: string;            // Faculty being evaluated
  facultyName: string;
  externalId: string;           // External evaluator assigned
  externalName: string;
  department: DepartmentValue;
  
  // Evaluations from each role
  hodEvaluation: EvaluatorMarks;
  deanEvaluation: EvaluatorMarks;
  externalEvaluation: EvaluatorMarks;
  
  // Summary
  totalMarksReceived: number;    // Sum of all evaluations
  averageMarks: number;          // Average of completed evaluations
  evaluationsCompleted: number;  // Count of completed evaluations (0-3)
  isCompleted: boolean;          // All three evaluations done
  
  createdAt: Date;
  updatedAt: Date;
}

const evaluatorMarksSchema = {
  evaluatorId: {
    type: String,
    default: '',
  },
  evaluatorName: {
    type: String,
    default: '',
  },
  knowledge: {
    type: Number,
    default: 0,
    min: 0,
    max: 20,
  },
  skills: {
    type: Number,
    default: 0,
    min: 0,
    max: 20,
  },
  attributes: {
    type: Number,
    default: 0,
    min: 0,
    max: 10,
  },
  outcomesInitiatives: {
    type: Number,
    default: 0,
    min: 0,
    max: 20,
  },
  selfBranching: {
    type: Number,
    default: 0,
    min: 0,
    max: 10,
  },
  teamPerformance: {
    type: Number,
    default: 0,
    min: 0,
    max: 20,
  },
  comments: {
    type: String,
    default: '',
  },
  totalMarks: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  evaluatedAt: {
    type: Date,
    default: null,
  },
};

const interactionEvaluationSchema = new Schema<InteractionEvaluation>(
  {
    facultyId: {
      type: String,
      required: true,
      index: true,
    },
    facultyName: {
      type: String,
      required: true,
    },
    externalId: {
      type: String,
      required: true,
      index: true,
    },
    externalName: {
      type: String,
      required: true,
    },
    department: {
      type: String,
      enum: DEPARTMENT.map((option) => option.value),
      required: true,
      index: true,
    },
    hodEvaluation: evaluatorMarksSchema,
    deanEvaluation: evaluatorMarksSchema,
    externalEvaluation: evaluatorMarksSchema,
    totalMarksReceived: {
      type: Number,
      default: 0,
      min: 0,
    },
    averageMarks: {
      type: Number,
      default: 0,
      min: 0,
    },
    evaluationsCompleted: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique faculty-external pair per department
interactionEvaluationSchema.index(
  { facultyId: 1, externalId: 1, department: 1 },
  { unique: true }
);

// Method to recalculate summary fields
interactionEvaluationSchema.methods.recalculateSummary = function() {
  let total = 0;
  let count = 0;

  if (this.hodEvaluation && this.hodEvaluation.evaluatorId) {
    total += this.hodEvaluation.totalMarks;
    count++;
  }
  if (this.deanEvaluation && this.deanEvaluation.evaluatorId) {
    total += this.deanEvaluation.totalMarks;
    count++;
  }
  if (this.externalEvaluation && this.externalEvaluation.evaluatorId) {
    total += this.externalEvaluation.totalMarks;
    count++;
  }

  this.totalMarksReceived = total;
  this.evaluationsCompleted = count;
  this.averageMarks = count > 0 ? total / count : 0;
  this.isCompleted = count === 3;
};

export default mongoose.model<InteractionEvaluation>('InteractionEvaluation', interactionEvaluationSchema);
