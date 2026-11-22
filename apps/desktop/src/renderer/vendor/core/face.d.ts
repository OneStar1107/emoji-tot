/**
 * Faces, as a small vocabulary rather than a picture per state.
 *
 * Two eyes and a mouth, each with a handful of styles, is enough for sixty
 * expressions: the difference between "thinking" and "confused" is a mouth
 * curve, not a new drawing. Keeping it a vocabulary also means a new state
 * costs three words.
 */
export type EyeStyle = 'dot' | 'arc' | 'closed' | 'wide' | 'star' | 'line' | 'heart' | 'squint' | 'pill' | 'half';
export type MouthStyle = 'smile' | 'open' | 'flat' | 'wave' | 'o' | 'grin' | 'tiny' | 'tongue' | 'big' | 'smirk' | 'dot' | 'frown';
/**
 * The eyebrow line, as a posture rather than a picture.
 *
 * Eyebrows are the one part a mouth cannot fake: "puzzled" and "confused" are
 * the same mouth and different brows, and so are "satisfied" and "proud".
 * Six postures cover every pair the lexicon actually distinguishes.
 */
export type BrowStyle = 'flat' | 'raised' | 'down' | 'one-up' | 'knit' | 'skeptic';
/** Which part of the day a state belongs to. */
export type FaceGroup = 'life' | 'emotion' | 'agent';
/**
 * What a state means, in the words a picker shows.
 *
 * The face itself is geometry; this is the only place that says "this one is
 * called 待机放空 and it means the ball is looking around quietly". Keeping the
 * copy next to the geometry is what lets a host label a menu without a second
 * table drifting out of sync.
 */
export interface FaceMeta {
    id: string;
    name: string;
    group: FaceGroup;
    /** One line, behaviour first — what you would see, not how it feels. */
    desc: string;
}
/** Little props emoji use to make a feeling unmistakable. */
export type FaceMark = 'tear' | 'sweat' | 'anger' | 'sparkle' | 'zzz';
export interface FaceSpec {
    eye: EyeStyle;
    mouth: MouthStyle;
    blush?: boolean;
    /**
     * Where the face leans, in shape units.
     *
     * A face pinned to the centre of the body reads as a decal. Leaning it —
     * back when surprised, down when sad, sideways when confused — is most of
     * what makes an expression look felt rather than displayed.
     */
    dx?: number;
    dy?: number;
    /** Extra eye size on top of the shape's own. */
    eyeScale?: number;
    /** Extra mouth size. */
    mouthScale?: number;
    /** Second eye size relative to the first: one waking eye, one still shut. */
    eyeAsym?: number;
    /** Eyebrow posture drawn above the eyes, in ink. */
    brow?: BrowStyle;
    /**
     * How hard the whole face trembles, 0–1.
     *
     * Drawn as a small uneven offset plus two motion ticks at the temples: a
     * still image of a shaking face still has to read as shaking, because the
     * gallery renders stills and a screenshot is the only evidence a reviewer
     * has.
     */
    shake?: number;
    /** Prop drawn next to the face (tear, sweat, anger vein, sparkle, zzz). */
    marks?: FaceMark[];
}
export declare const FACES: Record<string, FaceSpec>;
export declare const FACE_IDS: readonly string[];
/** Anything unlisted still gets a face: a character must never render blank. */
export declare function faceFor(state: string): FaceSpec;
/**
 * The state table a picker reads: Chinese name, group, and one behaviour line.
 *
 * This table is the one place a state is named: the site's expression wall,
 * its docs protocol table and its drawer all read it (through the gallery's
 * faces helper), so a state cannot be called one word on one page and another
 * on the next. Ten states are drawn but not numbered by the protocol; before
 * the wall read this table they fell back to their English ids.
 * * Grouping follows the three things this ball actually does — living, feeling,
 * and working — so a host can offer "what is it up to" without inventing its
 * own taxonomy.
 */
export declare const FACE_META: readonly FaceMeta[];
/** Look one up, or fall back to the raw id so a picker never shows nothing. */
export declare function faceMeta(id: string): FaceMeta;
/** Just the states in one group, in table order — the shape a menu wants. */
export declare function facesInGroup(group: FaceGroup): FaceMeta[];
