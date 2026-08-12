import type { Block, BlockSeed } from './blocks'
import type { Deck, Leaf } from './types'

/**
 * *Tools for Change*, transcribed.
 *
 * The 11 spreads of the Figma file, expressed as a document this builder
 * produces. It is the seed document, and it is also the proof: if a page here
 * cannot be built out of the component vocabulary, the vocabulary is wrong and
 * this file is where that shows up first.
 *
 * ## What "exactly" means here
 *
 * Same components, sizes, colours, column runs and copy. *Not* identical line
 * breaks — those depend on the exact cut of Review Condensed Heavy and Neue
 * Haas Grotesk, and on a greedy wrap where Figma uses its own. Chasing
 * character-level parity would mean hand-tuned magic numbers that break the
 * moment anyone edits a word, which is the opposite of a builder.
 *
 * Two places knowingly differ from the file and are better for it:
 *
 *   - **Chart bars are true to their values.** The file's bars are only roughly
 *     proportional (10% is drawn at 84 where proportion wants 90.5; 2.5% at 39
 *     where it wants 22.6). Those are drawing slips, and reproducing them would
 *     mean shipping a chart that misreports its own data.
 *   - **Captions sit under their figures**, where the file positions several by
 *     hand at a fixed height on the page.
 *
 * Ids are literals rather than generated, so the seed is deterministic and a
 * diff between two runs is empty.
 */

let n = 0
const b = (block: BlockSeed): Block => ({ ...block, id: `tfc_${(n += 1)}` }) as Block

const EXEC = 'Executive summary'
const FINDINGS = 'Findings and implications'

const leaves: Leaf[] = [
  // -- 1. Cover, across the full spread ------------------------------------
  {
    id: 'tfc-cover',
    full: true,
    bare: true,
    surface: 'paper',
    bodySize: 'l',
    templateId: 'cover',
    blocks: [
      b({ kind: 'text', text: 'TOOLS FOR CHANGE', role: 'statementNote', align: 'center' }),
      b({ kind: 'figure', imageRef: null, col: 1, span: 7, aspect: 0.55 }),
      b({
        kind: 'statement',
        text: 'Understanding the needs of climate justice organizers in Canada',
        highlights: ['Understanding the needs of climate justice organizers in Canada'],
        col: 2,
        span: 5,
      }),
    ],
  },

  // -- 2. Colophon | About the author --------------------------------------
  {
    id: 'tfc-colophon',
    surface: 'paperWarm',
    bodySize: 's',
    templateId: 'colophon',
    blocks: [
      b({
        kind: 'para',
        indent: false,
        col: 0,
        span: 6,
        text:
          'This report is produced by the Climate Justice Organizing HUB, a project of the Small Change Fund.\n' +
          'The author would like to thank the organizers who participated in interviews for sharing their stories, challenges, and aspirations for the climate justice movement across so-called Canada, and for their tireless work in making the movement what it is.\n' +
          'Any and all errors are of the author.',
      }),
      b({ kind: 'spacer', height: 330 }),
      b({
        kind: 'credits',
        col: 0,
        span: 4,
        rows: [
          { label: 'Main Author', value: 'Amanda Harvey-Sánchez' },
          { label: 'Data Collection', value: 'Amanda Harvey-Sánchez, Sara Adams, Jacqueline Lee-Tam' },
          { label: 'Editors', value: 'Jacqueline Lee-Tam, Sara Adams, Tom Liacas' },
          { label: 'Report Design', value: 'Mackenzie Burnett' },
        ],
      }),
    ],
  },
  {
    id: 'tfc-author',
    surface: 'paperWarm',
    bodySize: 'xs',
    runningHead: 'About the author',
    templateId: 'bio',
    blocks: [
      b({
        kind: 'para',
        indent: false,
        col: 4,
        span: 5,
        text:
          'Amanda Harvey-Sánchez (she/her) is a Latina organizer, activist-researcher, and educator. The daughter of a climate scientist and a teacher, Amanda was called into the climate justice movement through working on her campus fossil fuel divestment campaign at the University of Toronto in 2015.\n' +
          'Since then, she has had the opportunity to take part in community-based and justice-focused campaigns and projects across Canada, the US, India, and France. She is currently completing her PhD at the University of Toronto, on the social and political life of climate justice organizing in Canada. She is the HUB’s Activist Resource Person.',
      }),
      b({ kind: 'spacer', height: 150 }),
      b({ kind: 'figure', imageRef: null, col: 4, span: 5, aspect: 1.48 }),
    ],
  },

  // -- 3. Contents | full-bleed plate --------------------------------------
  {
    id: 'tfc-contents',
    surface: 'paperWarm',
    bodySize: 'xs',
    runningHead: 'Table of contents',
    templateId: 'contents',
    blocks: [
      b({ kind: 'tocEntry', label: 'Executive summary', folio: 6 }),
      b({ kind: 'tocEntry', label: 'Introduction', folio: 12 }),
      b({
        kind: 'tocEntry',
        label: 'Methodology',
        folio: 13,
        sections: [
          { label: 'participant recruitment', folio: 13 },
          { label: 'data collection', folio: 13 },
          { label: 'data analysis', folio: 14 },
        ],
      }),
      b({
        kind: 'tocEntry',
        label: 'Findings & implications',
        folio: 16,
        sections: [
          { label: 'doing', qualifier: '(campaigns/actions)', folio: 17 },
          { label: 'doing + being', qualifier: '(culture/relating)', folio: 23 },
          { label: 'being', folio: 27 },
          { label: 'being + structural factors', folio: 34 },
          { label: 'structural factors', folio: 38 },
          { label: 'canadian context', folio: 42 },
        ],
      }),
      b({
        kind: 'tocEntry',
        label: 'Conclusion',
        folio: 44,
        sections: [
          { label: 'considerations for funders + others', folio: 44 },
          { label: 'localized support', folio: 45 },
          { label: 'movement-wide support', folio: 45 },
        ],
      }),
      b({ kind: 'tocEntry', label: 'Appendix & questions', folio: 46 }),
    ],
  },
  {
    id: 'tfc-plate-1',
    bare: true,
    surface: 'pink',
    bodySize: 'xs',
    templateId: 'plate',
    plate: { imageRef: null },
    blocks: [
      b({ kind: 'spacer', height: 690 }),
      b({
        kind: 'para',
        indent: false,
        size: 'xs',
        text:
          'Funded support structures such as le HUB can play an important role in supporting grassroots climate justice groups in meeting recurring and newly emergent needs, fostering movement connections and dialogue, and helping to synthesise and amplify grassroots knowledge within a long-view of social movement development.',
      }),
    ],
  },

  // -- 4. Executive summary lede | the statement ---------------------------
  {
    id: 'tfc-exec-lede',
    surface: 'paper',
    bodySize: 'l',
    runningHead: EXEC,
    blocks: [
      b({ kind: 'spacer', height: 190 }),
      b({
        kind: 'para',
        indent: false,
        text:
          'During the summer and fall of 2023, the Climate Justice Organizing HUB conducted a needs assessment process through in-depth interviews with organizers in climate justice groups across Anglophone Canada. The intent was to hear directly from organizers in the climate justice movement about their current activities and projects, biggest challenges, and ideas for more tailored support and resources.',
      }),
    ],
  },
  {
    id: 'tfc-statement',
    surface: 'paperWarm',
    bodySize: 'xs',
    templateId: 'statement',
    blocks: [
      b({
        kind: 'statement',
        text: 'Le HUB members spoke with 21 organizers from 16 organizations across 6 provinces.',
        highlights: ['21 organizers', '16 organizations', '6 provinces.'],
      }),
      b({ kind: 'figure', imageRef: null, aspect: 1.08 }),
      b({
        kind: 'text',
        role: 'statementNote',
        text: '(Ontario, Quebec, British Columbia, Alberta, Saskatchewan, and Manitoba)',
      }),
    ],
  },

  // -- 5. Exec summary: the open codes, over two leaves --------------------
  {
    id: 'tfc-defs-1',
    surface: 'paper',
    bodySize: 'xs',
    runningHead: EXEC,
    templateId: 'defList',
    blocks: [
      b({
        kind: 'para',
        indent: false,
        size: 'l',
        text:
          'The top challenges, areas of focus, and areas where support is needed are summarized below. Detailed exposition, analysis, resources, implications, and possible future directions follow in the main report.',
      }),
      b({ kind: 'spacer', height: 84 }),
      b({
        kind: 'defList',
        rows: [
          {
            term: 'Campaign development',
            def: 'The process of ideating, developing, and carrying out a campaign, including elements such as creating a theory of change, aligning on a strategy, and choosing effective tactics.',
          },
          {
            term: 'Canada-specific resources',
            def: 'Organizing resources, knowledge, and frameworks that are tailored to the Canadian context and speak to its political, geographical, and economic conditions and systems of governance.',
          },
          {
            term: 'Community care & organizing culture',
            def: 'Practices and conditions for fostering a healthy, grounded, and empowering organizing culture and a broader sense of community care.',
          },
          {
            term: 'Conflict transformation',
            def: 'Processes, skills, and best practices for navigating organizational and interpersonal conflicts in generative ways.',
          },
        ],
      }),
    ],
  },
  {
    id: 'tfc-defs-2',
    surface: 'paper',
    bodySize: 'xs',
    runningHead: EXEC,
    templateId: 'defList',
    blocks: [
      b({
        kind: 'defList',
        rows: [
          {
            term: 'Funding',
            def: 'Reliable, sustainable, and non-restrictive sources of funding for grassroots organizing.',
          },
          {
            term: 'Hard organizing skills',
            def: 'Basic skills that are transferable across campaigns and may be useful to organizers across a wide variety of contexts, such as one-on-one conversations, house meetings, canvassing, meeting facilitation, and event planning.',
          },
          {
            term: 'Media & communications',
            def: 'Knowledge, resources, and tips on developing a media and communications plan, including basic skills such as writing press releases, doing pitch calls, and developing a social media presence, and more advanced skills such as developing a cohesive and impactful public media story that propels campaigns forward.',
          },
          {
            term: 'Multi-racial organizing',
            def: 'Practices, skills, and conditions for working across difference, geared towards fostering a multi-racial movement where historically marginalized groups and people feel empowered to lead and enact change.',
          },
          {
            term: 'Recruitment, retention, and base building',
            def: 'Recruiting, onboarding, engaging, and retaining new members into an organization and/or campaign role or project while building a base of supporters beyond already-committed activists.',
          },
        ],
      }),
    ],
  },

  // -- 6. Remaining codes | the summing-up ---------------------------------
  {
    id: 'tfc-defs-3',
    surface: 'paper',
    bodySize: 'xs',
    runningHead: EXEC,
    templateId: 'defList',
    blocks: [
      b({
        kind: 'defList',
        rows: [
          {
            term: 'Security culture',
            def: 'Skills, roles, and best-practices for maintaining the safety, security, and well-being of organizers at actions, including skills in marshalling, de-escalation, and effective direct action planning.',
          },
          {
            term: 'Space for convening',
            def: 'Accessible physical space for organizers to convene, gather, learn, share knowledge, and work together.',
          },
          {
            term: 'Polycrisis',
            def: 'Multiplicity of overlapping social, economic, political, and environmental crises which create barriers to organizing in terms of time, energy, motivation, focus, and morale.',
          },
        ],
      }),
    ],
  },
  {
    id: 'tfc-exec-close',
    surface: 'paper',
    bodySize: 'l',
    runningHead: EXEC,
    blocks: [
      b({
        kind: 'para',
        text:
          'While many of these challenges may apply across grassroots groups and non-governmental organizations, it is not surprising that they emerge as top needs amongst grassroots climate justice groups in particular.\n' +
          'In contrast to the work of many salaried environmental advocacy organizations, grassroots climate justice organizing is a much more dynamic, emergent, and experimental process.\n' +
          'Findings from this study reveal that while organizers across so-called Canada are making use of resources and support from the HUB, many organizers are still seeking additional support. Meeting these needs will require expanding the capacity and reach of funded support structures across so-called Canada, either through the HUB and/or through the creation of new support structures in other parts of the country.',
      }),
    ],
  },

  // -- 7. Introduction | figure --------------------------------------------
  {
    id: 'tfc-intro',
    surface: 'paper',
    bodySize: 'l',
    runningHead: 'Introduction',
    templateId: 'body',
    blocks: [
      b({
        kind: 'para',
        text:
          'The Climate Justice Organizing HUB was founded in April 2020 in recognition of the critical role that under-resourced grassroots organizations play in driving climate justice. The main goal of the HUB is to nourish, support, and develop the grassroots through needs-responsive trainings, knowledge libraries, and capacity-building tools.\n' +
          'More than three years after its founding, the landscape of climate justice organizing across so-called Canada has changed amidst deepening and overlapping crises, most notably the COVID-19 pandemic. Thus, it was time to reassess what new challenges and needs have arisen for grassroots groups and where and how the HUB and other funded support structures can work to best meet those needs.\n' +
          'This report serves as a snapshot of common themes across grassroots groups in the HUB’s network and preliminary avenues for intervention.',
      }),
    ],
  },
  {
    id: 'tfc-figure-1',
    surface: 'paper',
    bodySize: 'xs',
    blocks: [
      b({ kind: 'spacer', height: 90 }),
      b({
        kind: 'figure',
        imageRef: null,
        col: 1,
        span: 7,
        aspect: 1.34,
        caption: 'Photo courtesy of Jacqueline Lee-Tam',
      }),
    ],
  },

  // -- 8. Methodology | the chart ------------------------------------------
  {
    id: 'tfc-method',
    surface: 'paper',
    bodySize: 'xs',
    runningHead: 'Methodology',
    templateId: 'methodology',
    blocks: [
      b({
        kind: 'para',
        indent: false,
        size: 'm',
        text:
          'During the summer and fall of 2023, le HUB team members conducted a needs assessment process through in-depth interviews with organizers in climate justice groups across Anglophone Canada. The intent was to hear directly from organizers in the climate justice movement about their current activities and projects, biggest challenges, and ideas for more tailored support and resources from the HUB.',
      }),
      b({ kind: 'spacer', height: 70 }),
      b({ kind: 'subhead', text: 'Participant recruitment' }),
      b({
        kind: 'para',
        text:
          'HUB team members reached out to organizers at 27 climate justice groups within its existing network and 16 of them agreed to take part in an interview. Most interviews involved only one representative from the group, but a handful had two or three representatives, meaning that HUB team members spoke with 21 organizers in total. Grassroots groups were prioritized in a first round of requests for interviews, as this is the primary base of the HUB’s work; however, two non-profits were included in a second round of interviews to achieve greater geographical diversity across Anglophone Canada.\n' +
          'In total, the HUB team spoke with organizers working across six provinces: Ontario, Quebec, British Columbia, Alberta, Saskatchewan, and Manitoba, as illustrated in the image below.',
      }),
      b({ kind: 'subhead', text: 'Data collection' }),
      b({
        kind: 'para',
        text:
          'Interviews were conducted over zoom video conferencing software and lasted between 40 minutes to an hour. Interviews were not audio recorded, but HUB team members took notes on Cryptpad, an end-to-end encrypted platform. The HUB offered an honorarium of $50 to Black, Indigenous, and People of Colour (BIPOC) or otherwise marginalized organizers (eg. disabled, queer).',
      }),
      b({ kind: 'subhead', text: 'Data analysis' }),
      b({
        kind: 'para',
        text:
          'Data from interview notes were coded using thematic analysis. The top challenges, areas of focus, and areas where support is needed were grouped under 13 open codes:',
      }),
      b({
        kind: 'bulletList',
        columns: 2,
        items: [
          'Campaign development',
          'Hard organizing skills',
          'Media and communications',
          'Security culture',
          'Recruitment, retention, and base building',
          'Structure optimization',
          'Community care & organizing culture',
          'Conflict transformation',
          'Space for convening',
          'Multi-racial organizing',
          'Funding',
          'Polycrisis',
          'Canada-specific resources',
        ],
      }),
      b({
        kind: 'para',
        indent: false,
        text:
          'These 13 open codes were categorized into four main thematic areas, as illustrated in the image below. Many of these topics are also interrelated, thus some open-codes are grouped under more than one thematic area.',
      }),
    ],
  },
  {
    id: 'tfc-chart',
    surface: 'paperWarm',
    bodySize: 'xs',
    runningHead: 'Methodology',
    templateId: 'chart',
    blocks: [
      b({
        kind: 'chart',
        series: [
          { label: 'Doing', sublabel: 'Campaign/Action', value: 40 },
          { label: 'Being', sublabel: 'Culture/Relating', value: 25 },
          { label: 'Doing + Being', sublabel: 'Campaign/Action + Culture/Relating', value: 20 },
          { label: 'Being + Structural Factors', value: 10 },
          { label: 'Structural Factors', value: 7.5 },
          { label: 'Canadian Context', value: 2.5 },
        ],
      }),
    ],
  },

  // -- 9. Findings opener | plate with a quote overlay ---------------------
  {
    id: 'tfc-findings-open',
    surface: 'ochre',
    bodySize: 'l',
    runningHead: FINDINGS,
    blocks: [
      b({
        kind: 'para',
        text:
          'At the heart of all organizing and movement building is human relationships and interactions, and actions taken to bring about positive change in the world. To organize is to do together what one cannot achieve alone; organizing is a form of collective action.',
      }),
      b({ kind: 'spacer', height: 200 }),
      b({ kind: 'rule' }),
      b({
        kind: 'para',
        size: 'm',
        text:
          'Thus, organizing is fundamentally about “doing” things, but also doing them through “being” in particular kinds of relationships with others. Categories 1 and 2 above reflect this through the headings of “doing” and “being”, but it is important to note that any neat separation is purely for the purposes of theoretical understanding. Organizing is also impacted by broader political, social, economic and environmental factors; indeed, these are often part and parcel to the conditions organizers seek to change. These factors are reflected in category 3 “Structural Factors”.\n' +
          'Finally, conditions or factors specific to the geographical and political context of so-called Canada, where Le HUB is based, are reflected in category 4 “Canadian Context”. A brief summation of these categories follows.',
      }),
    ],
  },
  {
    id: 'tfc-plate-2',
    bare: true,
    surface: 'ochre',
    bodySize: 'xs',
    plate: { imageRef: null },
    blocks: [
      b({ kind: 'spacer', height: 330 }),
      b({
        kind: 'quoteOverlay',
        col: 1,
        span: 7,
        text:
          '“There are lots of people who are excited about things, but not a lot of people who are trained in organizing skills, or who know how to develop strategy.”',
      }),
      b({ kind: 'spacer', height: 300 }),
      b({ kind: 'text', role: 'caption', text: 'Photo courtesy of Jacqueline Lee-Tam', col: 4, span: 5 }),
    ],
  },

  // -- 10. The four categories, defined ------------------------------------
  {
    id: 'tfc-categories-1',
    surface: 'ochre',
    bodySize: 's',
    runningHead: FINDINGS,
    blocks: [
      b({ kind: 'heading', text: 'Doing' }),
      b({
        kind: 'deck',
        text: 'Actions, events, and protocols that organizers create or carry out, requiring specific skills and often undertaken as part of a particular campaign or overarching project, or in response to a specific event or injustice.',
      }),
      b({ kind: 'rule' }),
      b({ kind: 'heading', text: 'Being' }),
      b({
        kind: 'deck',
        text: 'Forms of interaction, dialogue, communication, and relationality that organizers engage in, often contributing to a sense of community and forging a particular organizing culture.',
      }),
      b({ kind: 'rule' }),
      b({ kind: 'heading', text: 'Structural Factors' }),
      b({
        kind: 'deck',
        text: 'Political, social, economic, and environmental factors that impact the ability of organizers to organize and achieve their objectives.',
      }),
    ],
  },
  {
    id: 'tfc-categories-2',
    surface: 'ochre',
    bodySize: 's',
    runningHead: FINDINGS,
    blocks: [
      b({ kind: 'heading', text: 'Canadian Context' }),
      b({
        kind: 'deck',
        text: 'Conditions or factors specific to the geographical and political context of so-called Canada as well as resources and organizing infrastructure tailored to the Canadian context.',
      }),
      b({ kind: 'rule' }),
    ],
  },

  // -- 11. Chapter opener | quote and resources ----------------------------
  {
    id: 'tfc-chapter',
    surface: 'ochre',
    bodySize: 's',
    runningHead: 'Doing (campaigns/actions)',
    templateId: 'chapter',
    blocks: [
      b({ kind: 'heading', text: 'Campaign Development' }),
      b({
        kind: 'deck',
        text: 'The process of ideating, developing, and carrying out a campaign, including elements such as creating a theory of change, aligning on a strategy, and choosing effective tactics.',
      }),
      b({ kind: 'spacer', height: 265 }),
      b({ kind: 'rule' }),
      b({
        kind: 'para',
        text:
          'Campaign development emerged as a major challenge and an area of interest across multiple groups. This was especially the case for groups that formed around a general interest or passion in “climate justice” broadly, rather than in response to a specific community need or targetted objective. For generalized “climate justice” groups, even the process of coming up with a campaign idea can prove challenging, as the scope of issues and topics related to “climate justice” is massive.\n' +
          'Some groups with a campaign idea also struggle to move beyond the “research phase” without external support. Groups currently engaged in campaign work are also facing challenges, including effective coordination and communication in coalition work, evaluation of tactics, and development of a long-view of campaigning. Some groups are also looking for opportunities to network with campaigners working on similar projects and discuss strategy at a movement level.',
      }),
    ],
  },
  {
    id: 'tfc-resources',
    surface: 'ochre',
    bodySize: 'm',
    runningHead: 'Doing (campaigns/actions)',
    templateId: 'resources',
    blocks: [
      b({
        kind: 'quote',
        col: 1,
        span: 7,
        text:
          '“We’re so used to doing the tactics without evaluating them and then people get burned out […] We need to build capacity amongst organizers to name what they’re experimenting with and what strategies they’re trying at a deeper learning level […] to understand how individual strategies are producing certain effects and to become more comfortable thinking about the transformative potential of certain actions.”',
      }),
      b({ kind: 'rule' }),
      b({
        kind: 'para',
        col: 1,
        span: 7,
        indent: false,
        text:
          'Some organizers expressed interest in a broader movement convening to share and exchange insights on strategy and campaigning, similar to Netroots or Power Shift. Of note, some organizers expressed a desire to network with organizations not directly working on climate, to begin to foster better reciprocal relationships across inter-connected causes. This is something funded support structures and other relevant organizations could consider hosting in the coming years.',
      }),
      b({ kind: 'rule' }),
      b({ kind: 'sectionHeading', text: 'Resources' }),
      b({
        kind: 'links',
        items: [
          {
            label: 'Groundswell',
            note: 'A series of seven workshops designed to equip participants with the tools and instincts needed to design, deploy, and assess a campaign for maximum impact. Sign up here.',
          },
        ],
      }),
      b({ kind: 'rule' }),
      b({ kind: 'sectionHeading', text: 'Related Articles' }),
      b({
        kind: 'links',
        items: [
          { label: 'What is the right way to come up with a campaign strategy?' },
          { label: 'Aligning on group direction: how to decide what you want and how you’ll get there' },
          { label: 'Building coalitions' },
        ],
      }),
    ],
  },
]

/** The seed document. */
export const toolsForChange = (): Deck => ({
  lang: 'en',
  leaves: leaves.map((l) => ({ ...l, blocks: [...l.blocks] })),
  startFolio: 1,
  overlayOpacity: { grunge265: 0.45, sunset001: 0.35 },
})
