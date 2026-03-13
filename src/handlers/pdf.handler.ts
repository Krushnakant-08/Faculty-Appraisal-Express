/**
 * pdf.handler.ts
 *
 * Generates the appraisal PDF by editing the test2.pdf template directly.
 *
 * The template was exported by Microsoft Word, so placeholders are stored as
 * fragmented text across PDF TJ arrays. This handler loads the template via
 * pdf-lib, inflates FlateDecode streams, replaces placeholders with faculty and
 * appraisal values, then recompresses the content streams before returning the
 * finished PDF.
 */

import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { PDFDocument, PDFRawStream, PDFName, PDFNumber } from 'pdf-lib';
import { FacultyAppraisal } from '../models/detailedAppraisal';
import { User } from '../models/user';
import { sendError, sendSuccess, HttpStatus } from '../utils/response';
import cloudinary, { getSignedAppraisalPdfUrl } from '../config/cloudinary';

const PDF_TEMPLATE_PATH = path.join(__dirname, '../../pdf_template/test2.pdf');

const PART_A_ROLE_FACTOR = {
  Professor: 0.68,
  'Associate Professor': 0.818,
  'Assistant Professor': 1,
} as const;

const PART_A_ROLE_MAX = {
  Professor: 300,
  'Associate Professor': 360,
  'Assistant Professor': 440,
} as const;

const PART_B_ROLE_MAX = {
  Professor: 370,
  'Associate Professor': 300,
  'Assistant Professor': 210,
} as const;

const PART_C_ROLE_MAX = {
  Professor: 160,
  'Associate Professor': 170,
  'Assistant Professor': 180,
} as const;

const ASSOCIATE_DEAN_EXTRA_MARKS = 50;

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toString();
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  return String(value).trim();
}

function getDesignationTotalSlots(
  designation: string,
  claimed: number,
  verified?: number,
): Record<string, string> {
  const isProfessor = designation === 'Professor';
  const isAssociateProfessor = designation === 'Associate Professor';
  const isAssistantProfessor = designation === 'Assistant Professor';

  return {
    Prof: isProfessor ? formatValue(claimed) : '',
    Assoc: isAssociateProfessor ? formatValue(claimed) : '',
    Assis: isAssistantProfessor ? formatValue(claimed) : '',
    ProfVerified: isProfessor ? formatValue(verified ?? 0) : '',
    AssocVerified: isAssociateProfessor ? formatValue(verified ?? 0) : '',
    AssisVerified: isAssistantProfessor ? formatValue(verified ?? 0) : '',
  };
}

// ── Variable map ─────────────────────────────────────────────────────────────
/**
 * Returns the substitution map for the 26 variables in test2.pdf.
 * Identity fields and appraisal marks come from the DB.
 */
function buildData(
  userName: string,
  designation: string,
  department: string,
  appraisal?: any,
): Record<string, string> {
  const partA = appraisal?.partA ?? {};
  const partB = appraisal?.partB ?? {};
  const partC = appraisal?.partC ?? {};
  const partD = appraisal?.partD ?? {};
  const partE = appraisal?.partE ?? {};
  const summary = appraisal?.summary ?? {};

  const sectionAMarks = partA.sectionMarks ?? {};
  const sectionARawTotal = Object.values(sectionAMarks).reduce(
    (sum: number, value) => sum + (typeof value === 'number' ? value : 0),
    0,
  );

  const partAFactorProfessor = PART_A_ROLE_FACTOR.Professor;
  const partAFactorAssociate = PART_A_ROLE_FACTOR['Associate Professor'];
  const partAFactorAssistant = PART_A_ROLE_FACTOR['Assistant Professor'];

  const partAMaxProfessor = PART_A_ROLE_MAX.Professor;
  const partAMaxAssociate = PART_A_ROLE_MAX['Associate Professor'];
  const partAMaxAssistant = PART_A_ROLE_MAX['Assistant Professor'];

  const partBMaxProfessor = PART_B_ROLE_MAX.Professor;
  const partBMaxAssociate = PART_B_ROLE_MAX['Associate Professor'];
  const partBMaxAssistant = PART_B_ROLE_MAX['Assistant Professor'];

  const partCMaxProfessor = PART_C_ROLE_MAX.Professor;
  const partCMaxAssociate = PART_C_ROLE_MAX['Associate Professor'];
  const partCMaxAssistant = PART_C_ROLE_MAX['Assistant Professor'];

  const partBDesignationTotals = getDesignationTotalSlots(
    designation,
    partB.totalClaimed ?? 0,
    partB.totalVerified ?? 0,
  );

  const partCDesignationTotals = getDesignationTotalSlots(
    designation,
    partC.totalClaimed ?? 0,
  );

  const isAssociateDeanRole =
    appraisal?.role === 'associate_dean' || partD.administrativeRole === 'associate_dean';

  const partDSuperiorMarks = partD.isAdministrativeRole
    ? isAssociateDeanRole
      ? (partD.adminDeanMarks ?? 0)
      : (partD.directorMarks ?? 0)
    : partD.portfolioType === 'both'
      ? (((partD.deanMarks ?? 0) + (partD.hodMarks ?? 0)) / 2)
      : partD.portfolioType === 'institute'
        ? (partD.deanMarks ?? 0)
        : (partD.hodMarks ?? 0);

  const associateDeanExtraMarks = isAssociateDeanRole
    ? ASSOCIATE_DEAN_EXTRA_MARKS
    : 0;

  const grandTotal = Math.min(
    1000,
    (summary.grandTotalClaimed ?? 0) + associateDeanExtraMarks,
  );
  const grandVerifiedTotal = Math.min(
    1000,
    (summary.grandTotalVerified ?? 0) + associateDeanExtraMarks,
  );

  const qualificationMarks = partC.pdfCompleted || partC.phdAwarded
    ? 20
    : partC.pdfOngoing
      ? 15
      : 0;

  return {
    // ── Identity (live from DB) ──────────────────────────────────────────────
    faculty_name:        userName,
    faculty_designation: designation,
    faculty_department:  department.replace(/\b\w/g, (ch) => ch.toUpperCase()),

    // ── Part A ───────────────────────────────────────────────────────────────
    result_analysis_marks:     formatValue(sectionAMarks.resultAnalysis ?? 0),
    course_outcome_marks:      formatValue(sectionAMarks.courseOutcome ?? 0),
    elearning_content_marks:   formatValue(sectionAMarks.eLearning ?? 0),
    academic_engagement_marks: formatValue(sectionAMarks.academicEngagement ?? 0),
    teaching_load_marks:       formatValue(sectionAMarks.teachingLoad ?? 0),
    projects_guided_marks:     formatValue(sectionAMarks.projectsGuided ?? 0),
    student_feedback_marks:    formatValue(sectionAMarks.studentFeedback ?? 0),
    ptg_meetings_marks:        formatValue(sectionAMarks.ptgMeetings ?? 0),
    section_a_total:           formatValue(sectionARawTotal),
    Prof_A:                    formatValue(partAFactorProfessor),
    Assoc_A:                   formatValue(partAFactorAssociate),
    Assis_A:                   formatValue(partAFactorAssistant),
    Prof_A_total_marks:        formatValue(partAMaxProfessor),
    Assoc_A_total_marks:       formatValue(partAMaxAssociate),
    Assis_A_total_marks:       formatValue(partAMaxAssistant),
    total_for_A:               formatValue(partA.totalClaimed ?? 0),
    total_for_A_verified:      formatValue(partA.totalVerified ?? 0),

    // ── Part B ───────────────────────────────────────────────────────────────
    sci_papers_marks:                           formatValue(partB.papers?.sci?.claimed ?? 0),
    sci_papers_verified_marks:                  formatValue(partB.papers?.sci?.verified ?? 0),
    esci_papers_marks:                          formatValue(partB.papers?.esci?.claimed ?? 0),
    esci_papers_verified_marks:                 formatValue(partB.papers?.esci?.verified ?? 0),
    scopus_papers_marks:                        formatValue(partB.papers?.scopus?.claimed ?? 0),
    scopus_papers_verified_marks:               formatValue(partB.papers?.scopus?.verified ?? 0),
    ugc_papers_marks:                           formatValue(partB.papers?.ugc?.claimed ?? 0),
    ugc_papers_verified_marks:                  formatValue(partB.papers?.ugc?.verified ?? 0),
    other_papers_marks:                         formatValue(partB.papers?.other?.claimed ?? 0),
    other_papers_verified_marks:                formatValue(partB.papers?.other?.verified ?? 0),
    scopus_conf_marks:                          formatValue(partB.conferences?.scopus?.claimed ?? 0),
    scopus_conf_verified_marks:                 formatValue(partB.conferences?.scopus?.verified ?? 0),
    other_conf_marks:                           formatValue(partB.conferences?.other?.claimed ?? 0),
    other_conf_verified_marks:                  formatValue(partB.conferences?.other?.verified ?? 0),
    scopus_chapter_marks:                       formatValue(partB.bookChapters?.scopus?.claimed ?? 0),
    scopus_chapter_verified_marks:              formatValue(partB.bookChapters?.scopus?.verified ?? 0),
    other_chapter_marks:                        formatValue(partB.bookChapters?.other?.claimed ?? 0),
    other_chapter_verified_marks:               formatValue(partB.bookChapters?.other?.verified ?? 0),
    scopus_books_marks:                         formatValue(partB.books?.intlIndexed?.claimed ?? 0),
    scopus_books_verified_marks:                formatValue(partB.books?.intlIndexed?.verified ?? 0),
    national_books_marks:                       formatValue(partB.books?.intlNational?.claimed ?? 0),
    national_books_verified_marks:              formatValue(partB.books?.intlNational?.verified ?? 0),
    local_books_marks:                          formatValue(partB.books?.local?.claimed ?? 0),
    local_b_verified_marks:                 formatValue(partB.books?.local?.verified ?? 0),
    wos_citations_marks:                        formatValue(partB.citations?.wos?.claimed ?? 0),
    wos_citations_verified_marks:               formatValue(partB.citations?.wos?.verified ?? 0),
    scopus_citations_marks:                     formatValue(partB.citations?.scopus?.claimed ?? 0),
    scopus_citations_verified_marks:            formatValue(partB.citations?.scopus?.verified ?? 0),
    google_citations_marks:                     formatValue(partB.citations?.googleScholar?.claimed ?? 0),
    google_citations_verified_marks:            formatValue(partB.citations?.googleScholar?.verified ?? 0),
    individual_copyright_registered_marks:          formatValue(partB.copyrights?.individualRegistered?.claimed ?? 0),
    individual_copyright_registered_verified_marks: formatValue(partB.copyrights?.individualRegistered?.verified ?? 0),
    individual_copyright_granted_marks:             formatValue(partB.copyrights?.individualGranted?.claimed ?? 0),
    individual_copyright_granted_verified_marks:    formatValue(partB.copyrights?.individualGranted?.verified ?? 0),
    institute_copyright_registered_marks:           formatValue(partB.copyrights?.instituteRegistered?.claimed ?? 0),
    institute_copyright_registered_verified_marks:  formatValue(partB.copyrights?.instituteRegistered?.verified ?? 0),
    institute_copyright_granted_marks:              formatValue(partB.copyrights?.instituteGranted?.claimed ?? 0),
    institute_copyright_granted_verified_marks:     formatValue(partB.copyrights?.instituteGranted?.verified ?? 0),
    individual_patent_registered_marks:             formatValue(partB.patents?.individualRegistered?.claimed ?? 0),
    individual_patent_registered_verified_marks:    formatValue(partB.patents?.individualRegistered?.verified ?? 0),
    individual_patent_published_marks:              formatValue(partB.patents?.individualPublished?.claimed ?? 0),
    individual_patent_published_verified_marks:     formatValue(partB.patents?.individualPublished?.verified ?? 0),
    individual_granted_marks:                       formatValue(partB.patents?.individualGranted?.claimed ?? 0),
    individual_granted_verified_marks:              formatValue(partB.patents?.individualGranted?.verified ?? 0),
    individual_comm_marks:                formatValue(partB.patents?.individualCommercialized?.claimed ?? 0),
    individual_comm_verified_marks:       formatValue(partB.patents?.individualCommercialized?.verified ?? 0),
    college_patent_registered_marks:                formatValue(partB.patents?.instituteRegistered?.claimed ?? 0),
    college_patent_registered_verified_marks:       formatValue(partB.patents?.instituteRegistered?.verified ?? 0),
    college_patent_published_marks:                 formatValue(partB.patents?.institutePublished?.claimed ?? 0),
    college_patent_published_verified_marks:        formatValue(partB.patents?.institutePublished?.verified ?? 0),
    college_granted_marks:                          formatValue(partB.patents?.instituteGranted?.claimed ?? 0),
    college_granted_verified_marks:                 formatValue(partB.patents?.instituteGranted?.verified ?? 0),
    college_commercialized_marks:                   formatValue(partB.patents?.instituteCommercialized?.claimed ?? 0),
    college_commercialized_verified_marks:          formatValue(partB.patents?.instituteCommercialized?.verified ?? 0),
    research_grants_marks:                          formatValue(partB.grants?.research?.claimed ?? 0),
    research_grants_verified_marks:                 formatValue(partB.grants?.research?.verified ?? 0),
    training_marks:                                 formatValue(partB.revenueTraining?.claimed ?? 0),
    training_verified_marks:                        formatValue(partB.revenueTraining?.verified ?? 0),
    nonresearch_grants_marks:                       formatValue(partB.grants?.nonResearch?.claimed ?? 0),
    nonresearch_grants_verified_marks:              formatValue(partB.grants?.nonResearch?.verified ?? 0),
    commercialized_products_marks:                  formatValue(partB.products?.commercialized?.claimed ?? 0),
    commercialized_products_verified_marks:         formatValue(partB.products?.commercialized?.verified ?? 0),
    developed_products_marks:                       formatValue(partB.products?.developed?.claimed ?? 0),
    developed_products_verified_marks:              formatValue(partB.products?.developed?.verified ?? 0),
    poc_products_marks:                             formatValue(partB.products?.poc?.claimed ?? 0),
    poc_products_verified_marks:                    formatValue(partB.products?.poc?.verified ?? 0),
    startup_revenue_pccoe_marks:                    formatValue(partB.startup?.revenue?.claimed ?? 0),
    startup_revenue_pccoe_verified_marks:           formatValue(partB.startup?.revenue?.verified ?? 0),
    startup_funding_pccoe_marks:                    formatValue(partB.startup?.funding?.claimed ?? 0),
    startup_funding_pccoe_verified_marks:           formatValue(partB.startup?.funding?.verified ?? 0),
    startup_products_marks:                         formatValue(partB.startup?.product?.claimed ?? 0),
    startup_products_verified_marks:                formatValue(partB.startup?.product?.verified ?? 0),
    startup_poc_marks:                              formatValue(partB.startup?.poc?.claimed ?? 0),
    startup_poc_verified_marks:                     formatValue(partB.startup?.poc?.verified ?? 0),
    startup_registered_marks:                       formatValue(partB.startup?.registered?.claimed ?? 0),
    startup_registered_verified_marks:              formatValue(partB.startup?.registered?.verified ?? 0),
    international_awards_marks:                     formatValue(partB.awards?.international?.claimed ?? 0),
    international_awards_verified_marks:            formatValue(partB.awards?.international?.verified ?? 0),
    government_awards_marks:                        formatValue(partB.awards?.government?.claimed ?? 0),
    government_awards_verified_marks:               formatValue(partB.awards?.government?.verified ?? 0),
    national_awards_marks:                          formatValue(partB.awards?.national?.claimed ?? 0),
    national_awards_verified_marks:                 formatValue(partB.awards?.national?.verified ?? 0),
    international_fel_marks:                 formatValue(partB.awards?.intlFellowship?.claimed ?? 0),
    intern_fel_ver_marks:        formatValue(partB.awards?.intlFellowship?.verified ?? 0),
    national_fellowship_marks:                      formatValue(partB.awards?.nationalFellowship?.claimed ?? 0),
    national_fellowship_verified_marks:             formatValue(partB.awards?.nationalFellowship?.verified ?? 0),
    active_mou_marks:                               formatValue(partB.industryInteraction?.activeMou?.claimed ?? 0),
    active_mou_verified_marks:                      formatValue(partB.industryInteraction?.activeMou?.verified ?? 0),
    lab_development_marks:                          formatValue(partB.industryInteraction?.collaboration?.claimed ?? 0),
    lab_development_verified_marks:                 formatValue(partB.industryInteraction?.collaboration?.verified ?? 0),
    internships_placements_marks:                   formatValue(partB.placement?.claimed ?? 0),
    internships_placements_verified_marks:          formatValue(partB.placement?.verified ?? 0),
    B_total_marks:           formatValue(PART_B_ROLE_MAX[designation as keyof typeof PART_B_ROLE_MAX] ?? 0),
    section_b_total:         formatValue(partB.totalClaimed ?? 0),
    Prof_B:                  partBDesignationTotals.Prof,
    Assoc_B:                 partBDesignationTotals.Assoc,
    Assis_B:                 partBDesignationTotals.Assis,
    Prof_B_total_marks:      formatValue(partBMaxProfessor),
    Assoc_B_total_marks:     formatValue(partBMaxAssociate),
    Assis_B_total_marks:     formatValue(partBMaxAssistant),
    Prof_B_total_verified:   partBDesignationTotals.ProfVerified,
    Assoc_B_total_verified:  partBDesignationTotals.AssocVerified,
    Assis_B_total_verified:  partBDesignationTotals.AssisVerified,
    total_for_B:             formatValue(partB.totalClaimed ?? 0),
    total_for_B_verified:    formatValue(partB.totalVerified ?? 0),
    verf_committee_name:     '',

    // ── Part C ───────────────────────────────────────────────────────────────
    Prof_qualification_marks:  formatValue(qualificationMarks),
    qualification_marks:       formatValue(qualificationMarks),
    training_attended_marks:   formatValue(
      Math.min(
        40,
        (partC.trainingAttended?.twoWeek ?? 0) * 20 +
          (partC.trainingAttended?.oneWeek ?? 0) * 10 +
          (partC.trainingAttended?.twoToFiveDays ?? 0) * 5 +
          (partC.trainingAttended?.oneDay ?? 0) * 2,
      ),
    ),
    training_organized_marks:  formatValue(
      Math.min(
        80,
        (partC.trainingOrganized?.twoWeek ?? 0) * 40 +
          (partC.trainingOrganized?.oneWeek ?? 0) * 20 +
          (partC.trainingOrganized?.twoToFiveDays ?? 0) * 10 +
          (partC.trainingOrganized?.oneDay ?? 0) * 2,
      ),
    ),
    phd_guided_marks:          formatValue(
      (partC.phdGuided?.awarded ?? 0) * 50 +
        (partC.phdGuided?.submitted ?? 0) * 25 +
        (partC.phdGuided?.ongoing ?? 0) * 10,
    ),
    section_c_total:           formatValue(partC.totalClaimed ?? 0),
    Prof_C:                    partCDesignationTotals.Prof,
    Assoc_C:                   partCDesignationTotals.Assoc,
    Assis_C:                   partCDesignationTotals.Assis,
    Prof_C_total_marks:        formatValue(partCMaxProfessor),
    Assoc_C_total_marks:       formatValue(partCMaxAssociate),
    Assis_C_total_marks:       formatValue(partCMaxAssistant),
    total_for_C:               formatValue(partC.totalClaimed ?? 0),
    total_for_C_verified:      formatValue(partC.totalVerified ?? 0),

    // ── Part D ───────────────────────────────────────────────────────────────
    Institute_Portfolio:   formatValue(partD.instituteLevelPortfolio ?? ''),
    Department_portfolio:  formatValue(partD.departmentLevelPortfolio ?? ''),
    deanMarks:             formatValue(partD.deanMarks ?? 0),
    hodMarks:              formatValue(partD.hodMarks ?? 0),
    self_awarded_marks:    formatValue(
      partD.isAdministrativeRole
        ? (partD.adminSelfAwardedMarks ?? 0)
        : (partD.selfAwardedMarks ?? 0),
    ),
    section_d_total:       formatValue(partD.totalClaimed ?? 0),
    total_for_D_verified:  formatValue(partD.totalVerified ?? 0),

    // ── Part E / Summary ──────────────────────────────────────────────────────
    assDeanHODMarks:      formatValue(partD.hodMarks ?? partD.directorMarks ?? 0),
    assDeanDeanMarks:     formatValue(partD.adminDeanMarks ?? partD.deanMarks ?? 0),
    assSelfawardedmarks:  formatValue(partD.adminSelfAwardedMarks ?? partD.selfAwardedMarks ?? 0),
    sumMarks_hod_dean:    formatValue((partD.hodMarks ?? 0) + (partD.deanMarks ?? 0)),
    assTotalMarks:        formatValue(
      (partD.isAdministrativeRole ? (partD.adminSelfAwardedMarks ?? 0) : (partD.selfAwardedMarks ?? 0)) +
        partDSuperiorMarks,
    ),
    extra_marks:          formatValue(partE.totalClaimed ?? 0),
    section_E_total:      formatValue(50),
    total_for_E_verified: formatValue(partE.totalVerified ?? 0),
    grand_total:          formatValue(grandTotal),
    grand_verified_marks: formatValue(grandVerifiedTotal),
  };
}

// ── Stream-level text substitution ───────────────────────────────────────────

/**
 * Join every `(fragment)` in a PDF TJ array to reconstruct the visible text.
 *
 * TJ arrays look like: `({f)3(a)7(cul)4(t)3(y_nam)4(e})`
 * Numbers between the parenthesised pieces are glyph-advance adjustments
 * (kerning); we ignore them — only the text portions matter.
 */
function extractTjText(arrayContent: string): string {
  const parts: string[] = [];
  // Matches `(...)` allowing escaped parens inside
  const re = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(arrayContent)) !== null) {
    parts.push(m[1]);
  }
  return parts.join('');
}

/**
 * Scan a decompressed PDF content stream for variable placeholders and
 * substitute them.
 *
 * Variables may span *multiple* consecutive TJ arrays (even across BT/ET
 * block boundaries) because Word's PDF export can word-wrap a long placeholder
 * so that the opening `{…body` lands in one positioned text block and the
 * closing `}` lands in the next.  The strategy:
 *
 *  1. Collect every `[…] TJ` occurrence in the stream with its byte-range
 *     and its joined `(fragment)` text.
 *  2. Slide a window forward; starting only at TJs whose text begins with `{`.
 *  3. Accumulate TJ text until the window matches `{varName}` exactly, or
 *     until it can no longer be a valid placeholder (too long / bad chars).
 *  4. Replace the first TJ in the window with `[(value)] TJ` and each
 *     remaining TJ in the window with `[( )] TJ` (blank space at that
 *     position so the layout is preserved).
 */
function substituteStream(
  streamText: string,
  data: Record<string, string>,
): string {
  // ── Collect all TJ arrays with their positions ───────────────────────────
  interface TjEntry { start: number; end: number; text: string; }
  const tjs: TjEntry[] = [];
  const tjRe = /\[([^\]]*)\]\s*TJ/g;
  let scan: RegExpExecArray | null;
  while ((scan = tjRe.exec(streamText)) !== null) {
    tjs.push({
      start: scan.index,
      end:   scan.index + scan[0].length,
      text:  extractTjText(scan[1]),
    });
  }
  if (tjs.length === 0) return streamText;

  // ── Find multi-TJ windows that form a complete {varName} ─────────────────
  // varName chars: letters, digits, underscore — max 80 chars
  const MAX_VAR_LEN = 82; // 80 name chars + 2 braces

  const replacements: Array<{
    entries: TjEntry[];
    value: string;
  }> = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < tjs.length; i++) {
    if (usedIndices.has(i)) continue;
    // Window must start with a TJ that begins with '{'
    if (!tjs[i].text.trimStart().startsWith('{')) continue;

    let combined = '';
    for (let j = i; j < tjs.length && j < i + 20; j++) {
      combined += tjs[j].text;
      if (combined.length > MAX_VAR_LEN) break; // too long to be a var

      const trimmed = combined.trim();
      // Must still start with '{' after trimming
      if (!trimmed.startsWith('{')) break;

      const varMatch = /^\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/.exec(trimmed);
      if (varMatch) {
        const key = varMatch[1];
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          const window = tjs.slice(i, j + 1);
          replacements.push({ entries: window, value: data[key] });
          for (let k = i; k <= j; k++) usedIndices.add(k);
        }
        break; // matched or unknown key — stop extending this window
      }
    }
  }

  if (replacements.length === 0) return streamText;

  // ── Apply replacements back-to-front so positions stay valid ─────────────
  // Sort by start position, descending
  replacements.sort((a, b) => b.entries[0].start - a.entries[0].start);

  let result = streamText;
  for (const rep of replacements) {
    const { entries, value } = rep;
    const displayValue = value || ' ';
    const escaped = displayValue
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

    // Replace from the start of the first entry to the end of the last entry.
    // First TJ → value; remaining TJs within the range → single space each.
    let chunk = `[(${escaped})] TJ`;
    for (let k = 1; k < entries.length; k++) {
      // Preserve the raw bytes between consecutive entries, then blank the TJ
      const between = result.slice(entries[k - 1].end, entries[k].start);
      chunk += between + '[( )] TJ';
    }

    result =
      result.slice(0, entries[0].start) +
      chunk +
      result.slice(entries[entries.length - 1].end);
  }

  return result;
}

// ── Handler ───────────────────────────────────────────────────────────────────

/**
 * GET /appraisal/:userId/pdf
 *
 * Returns a filled copy of test2.pdf with variable placeholders replaced.
 */
export const downloadAppraisalPDF = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    if (!fs.existsSync(PDF_TEMPLATE_PATH)) {
      sendError(
        res,
        'PDF template (test2.pdf) not found on server',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      return;
    }

    const { userId } = req.params;

    // ── 1. Fetch user ────────────────────────────────────────────────────────
    const user = await User.findOne({ userId }).lean();
    if (!user) {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

    const appraisal = await FacultyAppraisal.findOne({ userId }).lean();

    // ── 2. Build substitution map ────────────────────────────────────────────
    const data = buildData(
      user.name,
      user.designation as string,
      user.department as string,
      appraisal,
    );

    // ── 3. Load PDF via pdf-lib ──────────────────────────────────────────────
    // Using pdf-lib ensures correct cross-reference tables and object offsets
    // are recalculated in the final output.
    const templateBytes = fs.readFileSync(PDF_TEMPLATE_PATH);
    const pdfDoc = await PDFDocument.load(templateBytes, {
      updateMetadata: false,
    });
    const context = pdfDoc.context;

    // ── 4. Process every FlateDecode (zlib) content stream ───────────────────
    for (const [, obj] of context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;

      // Only handle FlateDecode streams
      const filter = obj.dict.get(PDFName.of('Filter'));
      const filterStr: string = filter?.toString?.() ?? '';
      if (!filterStr.includes('FlateDecode')) continue;

      let inflated: Buffer;
      try {
        inflated = zlib.inflateSync(Buffer.from(obj.contents));
      } catch {
        continue; // not actually compressed or corrupt — skip silently
      }

      const original = inflated.toString('latin1');
      const modified = substituteStream(original, data);

      if (modified === original) continue; // nothing changed

      // Recompress and update stream bytes + /Length
      const recompressed = zlib.deflateSync(Buffer.from(modified, 'latin1'));
      // pdf-lib's PDFRawStream.contents is a mutable Uint8Array property
      // pdf-lib types mark contents as readonly but it IS mutable at runtime
      (obj as unknown as { contents: Uint8Array }).contents = new Uint8Array(recompressed);
      obj.dict.set(PDFName.of('Length'), PDFNumber.of(recompressed.length));
    }

    // ── 5. Serialize PDF ──────────────────────────────────────────────────────
    const outputBytes = await pdfDoc.save();
    const outputBuffer = Buffer.from(outputBytes);

    // ── 6. Upload to Cloudinary (replace prior file with a real PDF asset) ───
    const appraisalYear = appraisal?.appraisalYear ?? new Date().getFullYear();
    const assetFolder = `Home/Faculty_Appraisal/${appraisalYear}/pdfs`;
    const publicId = `${assetFolder}/${userId}`;

    // Clean up legacy raw uploads from the earlier implementation if they exist.
    await Promise.allSettled([
      cloudinary.uploader.destroy(publicId, { resource_type: 'raw', invalidate: true }),
      cloudinary.uploader.destroy(`${publicId}.pdf`, { resource_type: 'raw', invalidate: true }),
    ]);

    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: 'image',
            asset_folder: assetFolder,
            use_asset_folder_as_public_id_prefix: true,
            public_id: `${userId}`,
            filename_override: `${userId}.pdf`,
            display_name: `${userId}.pdf`,
            overwrite: true,
            invalidate: true,
          },
          (error, result) => {
            if (error || !result) return reject(error ?? new Error('No result from Cloudinary'));
            resolve({ secure_url: result.secure_url });
          },
        )
        .end(outputBuffer);
    });

    // ── 7. Persist canonical Cloudinary URL and return a signed view URL ─────
    await FacultyAppraisal.findOneAndUpdate({ userId }, { pdfUrl: uploadResult.secure_url });

    const signedPdfUrl = getSignedAppraisalPdfUrl(userId, appraisalYear);

    sendSuccess(res, { pdfUrl: signedPdfUrl }, 'PDF generated successfully');
  } catch (error: unknown) {
    console.error('[downloadAppraisalPDF] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    sendError(
      res,
      'Failed to generate PDF',
      HttpStatus.INTERNAL_SERVER_ERROR,
      process.env.NODE_ENV === 'development' ? msg : undefined,
    );
  }
};
