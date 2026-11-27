/**
 * The release diary: one entry per change a reader would want to know about, and the
 * feed built from it.
 *
 * Entries are verbatim history. A release note records what was published at the time,
 * so an old entry is not edited when the site changes; a correction is a new entry.
 * That is why tests/coverage.test.ts leaves this file out of its sweep for stale
 * coverage counts (the launch entry says 320, which was the count published that day).
 *
 * The page at /releases/ and the feed at /feed.xml both read RELEASES, so an entry
 * written here appears in both. The feed carries releases only: a new finding gets a
 * release entry of its own, which is how it reaches the feed.
 */
import { MYE5_PUBLISHED } from "./area-density";
import { PYRAMID_PUBLISHED_DAY } from "./age-pyramid";
import { CHANGE_PUBLISHED_DAY } from "./population-change";
import { NOT_ANNOUNCED } from "./section-dates";
import { FEED_PATH, FEED_TITLE, RELEASES_PATH, SITE_URL, buildAbsoluteUrl, type ReleaseEntry } from "./site";

export { FEED_PATH, FEED_TITLE, RELEASES_PATH };
export const RELEASES_DESCRIPTION =
  "Release diary for UK Demographics covering model updates, data refreshes, and new features.";

const ENTRIES: ReleaseEntry[] = [
  {
    date: "2026-11-18",
    title: "Why the population changed: births, deaths and migration for every council",
    summary: `Each council now has a population change page (for example /places/burnley/population-change/). It shows births, deaths, moves within the UK, international migration and the other changes ONS records, and the parts add up exactly to the change in the ONS estimate, for the latest year and for every year since mid-2011. The figures are from ONS table MYEB3, published ${CHANGE_PUBLISHED_DAY}. A hub at /population-change/ lists every council A to Z, and each council has a CSV of the same figures. These are observed estimates: there is no projection and no breakdown by ethnic group.`,
    sourceUrl: "https://ukdemographics.co.uk/population-change/"
  },
  {
    date: "2026-11-15",
    title: "A chart on each dashboard, the latest estimate on /compare/, and a footer that says what is counted",
    summary: "The compare page now leads with the population at mid-2025, the change since mid-2011 and median age, from the ONS mid-year estimates; the Census 2021 count stays and is labelled as such. The regional page charts population change by region, and the pressure, housing and schools pages each chart how many councils fall in each range of the measure the page already tables, with the counts in a table beneath. Those charts name and order no area. The footer on every page said \"No tracking\". Page views are counted, as totals only, by Cloudflare Web Analytics, which sets no cookie; the footer now says so, as the privacy page already did. Constituency pages now head their demographic snapshot as estimated, because it is built from council figures and is not an official constituency figure, and credit the MP photograph to UK Parliament, whose server it loads from.",
    sourceUrl: "https://ukdemographics.co.uk/compare/"
  },
  {
    date: "2026-11-11",
    title: "Postcode lookup described accurately, and phone layout and contrast fixes",
    summary: "The page at /your-area/ said that nothing typed into the search box is sent anywhere. That was wrong. When what you type looks like a postcode, your browser sends it to Postcodes.io to find the council it belongs to, from the search box there and the one on the homepage. The page now says so, and the privacy page has a section on the lookup. This site does not record what is typed, and the lookup itself is unchanged. Separately, the housing and migration pages no longer scroll sideways on a phone, and party names, bar labels and notes that fell below the 4.5 to 1 contrast minimum were corrected.",
    sourceUrl: "https://ukdemographics.co.uk/privacy/#postcode-lookup"
  },
  {
    date: "2026-11-10",
    title: "Population pyramids for every council, mid-2011 to mid-2025",
    summary: `Each council now has a population pyramid (for example /places/burnley/population-pyramid/): population by single year of age and sex for every year from mid-2011 to mid-2025, from ONS table MYEB1, published ${PYRAMID_PUBLISHED_DAY}. The picture is drawn for the latest year with mid-2011 as an outline and reads without script. With script there is a year slider, playback, a share of population view and a comparison outline. A hub at /population-pyramids/ has the England and Wales pyramid and a council finder, and each council has a CSV. These are observed estimates: there is no projection and no breakdown by ethnic group.`,
    sourceUrl: "https://ukdemographics.co.uk/population-pyramids/"
  },
  {
    date: "2026-11-05",
    title: "The latest population estimate first, with density, median age and neighbouring councils",
    summary: `The homepage and every place page now lead with the latest ONS population estimate. The homepage opens on population from mid-2011 to mid-2025 for England and Wales, as the sum of the councils the site covers. On a place page the answer box gives the mid-2025 estimate and the change since mid-2011 before the Census 2021 count, then density (ONS table MYE5) and median age (ONS table MYE6), each with its table and publication date (${MYE5_PUBLISHED}). Place pages also link to the councils that border them, related findings are matched by place, and there is a new page at /about/.`,
    sourceUrl: "https://ukdemographics.co.uk/about/"
  },
  {
    date: "2026-11-04",
    title: "How to cite a place page, and when each section's data was last checked",
    summary: `Every place page now ends with a citation in Harvard form: the site, the year, the page's own title, the editions of the ONS figures behind it (mid-year estimates published ${MYE5_PUBLISHED}, Census 2021 TS021 and Census 2011 KS201EW), the address and a space for the date you read it. A copy button sits beside it, with a link to that place's CSV of the same figures. The line under each section that gives the next update now also says when the publisher's schedule was read. A next update date appears only where the register holds the publisher's schedule page and the date it was read; elsewhere the line reads "${NOT_ANNOUNCED}".`,
    sourceUrl: "https://ukdemographics.co.uk/data/"
  },
  {
    date: "2026-10-14",
    title: "County census pages and regional population maps",
    summary: "New pages cover the 21 English county council areas, with population estimates, both censuses, six ethnic groups and district maps. Ceremonial unitaries are shown separately and excluded from county totals. Census 2021 county figures use the published county row. The accessible reconciliation records every difference from the district sum. Census 2011 and all 15 annual population estimates agree exactly with their district sums. Region pages now carry population and observed census maps. All area lists are A to Z.",
    sourceUrl: "https://ukdemographics.co.uk/places/counties/"
  },
  {
    date: "2026-10-14", title: "Population and census timeline maps",
    summary: "A national map shows population change since 2011 for each year of ONS estimates and ethnic group shares at the 2011 and 2021 censuses. Equal-area hexagons and geographic boundaries use the same figures. Population playback steps through held years; census views show the two censuses or their change, with all six groups beside the map. An alphabetical table remains available throughout.",
    sourceUrl: "https://ukdemographics.co.uk/maps/"
  },
  {
    date: "2026-10-14",
    title: "Map card reuse terms travel with each download",
    summary: "The terms now allow map cards on place pages to be shared unaltered with the site credit visible. The population cards link to those terms in their image metadata, and every downloaded card carries the same wording. The cards have their own reuse terms; the underlying government data remains under the Open Government Licence v3.0.",
    sourceUrl: "https://ukdemographics.co.uk/terms/#cards"
  },
  {
    date: "2026-10-14",
    title: "Area lists shown A to Z",
    summary: "Area lists now use alphabetical order across the homepage, places index, national, regional, schools, housing and exposure pages. The places index keeps its figures and filters, with ordering by area name or region only. Constituencies on place pages also appear A to Z. The national, schools, housing and exposure lists include every area with data instead of a selection ordered by a figure. The underlying figures are unchanged.",
    sourceUrl: "https://ukdemographics.co.uk/places/"
  },
  {
    date: "2026-10-14",
    title: "Crossing below half given as a decade, not a year",
    summary: "Place pages, the homepage and the places index gave a single year in which the White British share was projected to fall below half, such as \"around 2044\". The model projects 2031, 2041, 2051 and 2061 only, and the year was drawn in a straight line between two of them, so it was an assumption rather than model output. Each is now given as the decade between two projection years, such as \"between 2041 and 2051\", and only where both years are inside the area's plausibility horizon. The homepage listed the eight areas soonest to cross, which read as a ranking; it now groups the areas by decade, A to Z. The places index had shown \"not by 2061\" for areas within two model errors of the line and for areas whose later projection years are withheld; those now read n/a or \"not by\" the area's last published year.",
    sourceUrl: "https://ukdemographics.co.uk/places/"
  },
  {
    date: "2026-10-14",
    title: "Shift-share for all 318 councils, and Census 2021 shares as published",
    summary: "Census 2021 shares now use TS021 published counts, and the descriptive share calculation covers all 318 councils using exact predecessor sums for 2011. The national component is -6.1 percentage points. Its counts are sums of local authority rows, which can differ slightly from published national rows. The composition adjustment was previously called an age effect and the residual a migration effect, although neither age nor migration data enters the formula. Those unsupported labels and causal claims have been corrected. Burnley's components round to 80% national trend, 5% composition adjustment and 15% local residual. The finding records both the source and method corrections.",
    sourceUrl: "https://ukdemographics.co.uk/findings/shift-share-what-drives-change/"
  },
  {
    date: "2026-10-14",
    title: "2011 Census figures for the eleven councils formed since 2011",
    summary: "Eleven councils formed after 2011 had no 2011 point in their ethnic group timeline, because the site held their 2021 Census figure where the 2011 one belongs: Bournemouth, Christchurch and Poole; Buckinghamshire; Cumberland; Dorset; East Suffolk; North Northamptonshire; North Yorkshire; Somerset; West Northamptonshire; West Suffolk; and Westmorland and Furness. Each is a merger of whole 2011 districts, so its 2011 figure is now the sum of those districts' counts in Census 2011 table KS201EW: Cumberland's 274,549 residents are Allerdale's 96,422, Carlisle's 107,524 and Copeland's 70,603. Their place pages gain a 2011 point in the timeline and in the composition table, and the 318 areas' 2011 totals now add up to the England and Wales total of 56,075,912 exactly. The SEND finding's rank correlation had counted Bournemouth, Christchurch and Poole and Dorset as having no change in the White British share; with their 2011 figures it is -0.05, not -0.04, across the same 123 authorities, and the finding carries a dated update. The shift-share breakdown still covers the 307 areas with a 2011 Census row of their own; extending it to all 318 follows separately.",
    sourceUrl: "https://ukdemographics.co.uk/places/cumberland/"
  },
  {
    date: "2026-10-12",
    title: "Constituency profiles weighted by postcode share alone",
    summary: "Constituency pages build their White British and foreign-born shares from the local authorities each constituency overlaps. Each authority was weighted by the share of the constituency's postcodes in it multiplied by the whole authority's population, which pulled every split constituency towards its larger authority: Rossendale and Darwen showed 71.5% White British in 2021, weighted towards all of Blackburn with Darwen, and now shows 78.0%. The weight is now the postcode share alone. The 229 constituencies that span more than one authority are recomputed, and 175 of them move by 0.05 points or more on the 2021 share; the 345 inside one authority do not change. These remain authority-level figures apportioned by postcode share, not constituency counts.",
    sourceUrl: "https://ukdemographics.co.uk/constituencies/"
  },
  {
    date: "2026-10-12",
    title: "Six findings corrected after the October data refresh",
    summary: "Every figure in the findings was recomputed from the data files the site now publishes, and six findings carry a dated correction. The adult social care and SEND findings had used a 25-authority file typed in by hand in April 2026 that matched no published table and gave figures for district councils, which run neither service. On DHSC's 2024-25 figures, spend per adult is £687 for Lancashire County Council, which covers eight of the ten councils the adult social care finding compared, so its comparison does not hold. On DfE's 2025/26 figures, pupils with an EHC plan in England rose by 65.4% in five years, not the 42% the SEND finding gave, and growth shows no relationship with demographic change (rank correlation -0.04 across 123 authorities). The births finding had 2024 figures for five local authorities, four national counts and Burnley's split by the mother's region of birth that did not match ONS Tables 1 and 6a; Tower Hamlets, at 65.1%, was not past 70%. The 86-areas and Birmingham findings carry the corrected cohort-component figures, 54.7% and 20.6%, and the 86-areas finding no longer says the two models agree to within half a point. The Blackburn finding corrects a 2011 share and an asylum figure for Preston that matched no Home Office quarter. The adult social care and SEND findings are retitled to say what the published figures show, with the old headlines kept in their corrections.",
    sourceUrl: "https://ukdemographics.co.uk/findings/"
  },
  {
    date: "2026-10-12",
    title: "Two-model spread recomputed after a double count",
    summary: "The cohort-component model behind the two-model comparison on place pages read its population envelope, the ONS 2022-based subnational population projections, twice over: it added each area's \"All ages\" row to the rows for each single year of age, so every target was double the published figure (Burnley in 2031: 199,651 against the file's 99,825). It has been re-run on its own, with the fix and on the same inputs as model v8.0, and only its own fields change: the cohort-component 2051 White British share and its scenario range in 315 of the 318 areas, and the spread computed from them. The Hamilton-Perry projections, which are the headline figures, do not change. Across the 269 areas the current Hamilton-Perry model projects, the median 2051 spread is 6.7 percentage points, not approximately 8; the largest is 25.2, not 32.3; and 8 areas have a spread above 20 points, not 17. The spread changed in 266 of those 269 areas, by a median of 2.1 points and at most 7.1. The comparison is no longer shown for the other 49 areas, which carry projections from an earlier model run: in 28 of them the Hamilton-Perry figure was the cohort-component model's own earlier output, so the comparison set the model against itself. The methodology page now reads these figures from the data.",
    sourceUrl: "https://ukdemographics.co.uk/methodology/#two-models"
  },
  {
    date: "2026-10-12",
    title: "Pupils with an EHC plan corrected: the old count was doubled",
    summary: "Every place page's \"Total EHCPs\" figure was twice the Department for Education's count. Blackburn with Darwen showed 2,768; DfE's 2024/25 figure is 1,384. The script reading DfE's file sen_phase_type_.csv added up every local authority row marked as the total for all phases and all school types, and that file carries two such rows for each authority, one for all schools and one for schools that are not hospital schools, each with the full count. The 132 areas then on the site summed to 649,346, more than DfE's 482,640 for the whole of England. The \"EHCPs / 10k\" rate was built on the doubled count, so it was twice too high as well; five-year growth compared two counts doubled in the same way, so it was right. The section now reads DfE, Special educational needs in England, academic year 2025/26, published 11 June 2026, data set \"Pupils in all schools, by type of SEN provision\", taking only the row for all schools. It shows pupils with an EHC plan and DfE's own percentage of pupils, in place of a rate per 10,000 residents of every age that DfE does not use: Blackburn with Darwen has 1,549 pupils with an EHC plan, 5.2% of pupils, and England 538,547, 6.0%. The 21 county councils, left out of the old file, are back, so district pages now show their county's figures.",
    sourceUrl: "https://explore-education-statistics.service.gov.uk/find-statistics/special-educational-needs-in-england"
  },
  {
    date: "2026-10-12",
    title: "Homepage 2011 White British share corrected to 80.5%",
    summary: "The homepage gave the White British share of England and Wales in 2011 as 80.0%. It weighted each area's 2011 share by its 2021 population, and it counted the eleven authorities created after 2011, whose earliest figure on this site is from the 2021 Census, inside the 2011 figure. Census 2011 table KS201EW gives 45,134,686 White British residents of 56,075,912 in England and Wales, 80.5%, which is the figure the homepage now shows. Both Census years are now summed from Census counts and weighted by their own population; the 2021 figure, 74.4%, does not change.",
    sourceUrl: "https://ukdemographics.co.uk/"
  },
  {
    date: "2026-10-12",
    title: "Shift-share national effect recomputed from the Census",
    summary: "Every place page's shift-share breakdown, and the finding on what drives ethnic change, gave the national effect as -6.4 percentage points. That figure was not computed from the 2011 Census: the site's 2011 population totals were all zero, because the script reading Census table KS201EW did not recognise its \"All usual residents\" row, and the calculation fell back to a typed 80% for 2011. With the real totals, the White British share across the 307 authorities that can be compared on the same boundaries fell from 79.7% in 2011 to 73.5% in 2021 (Census 2011 KS201EW, Census 2021 TS021), a national effect of -6.2 points. The age structure and local components move with it on every page, and Barnsley and Sheffield, whose 2011 figures had left out the Other ethnic group, are recomputed in full: Sheffield's total change is -6.3 points, not -9.5. Coventry's leading component changes from the national trend to the local one. The finding carries a dated correction.",
    sourceUrl: "https://ukdemographics.co.uk/findings/shift-share-what-drives-change/"
  },
  {
    date: "2026-09-07",
    title: "One withholding rule for the counts, and a denominator with them",
    summary: "The homepage and the national page counted areas crossing below a 50% White British share, under a label promising the areas already below it. That is a flow counted as a stock, and it published 60 for 2051 while leaving out Birmingham, Leicester, Luton, Slough, Manchester and 22 others that had passed the threshold before the count began. The place pages also withhold a projected year where a residual Census group runs away past a quarter of the population at several times its 2021 share, so the site was counting Enfield in 2051 while Enfield's own page declined to show 2051 at all. Both rules now apply everywhere: 86 areas below 50% at 2051, across the 312 areas where 2051 is publishable, and 99 at 2061 across 255. The counts carry their denominator, because a count without one invites a comparison against the full 318. This is the figure the site's own finding has published since 13 August 2026. See pull request 58 and commit a9a98f0.",
    sourceUrl: "https://github.com/tompickup23/ukdemographics/pull/58"
  },
  {
    date: "2026-09-07",
    title: "Four findings reconciled to v8.0 data",
    summary: "The findings on Birmingham, the Arab population, Roma and Gypsy or Irish Traveller, and the NEWETHPOP validation were still carrying figures from the model run that the 13 August 2026 recalibration replaced. Every number in them has been re-derived from the data the place pages and the homepage render. Birmingham's projection table now reads 32.8% White British in 2031, 22.9% in 2041 and 9.1% in 2061, the last of those 4.4 points above the figure it replaces, and its 2021 Christian share is 36.2% rather than the raw Census Muslim share it had been crossed with. Six of the eight Arab 2051 shares were re-derived, Ealing to 11.2% and Kingston upon Thames to 4.2%, and the national count is now the Census figure at source: 320,203 people in England, 0.57% of the population, from table TS021. The Roma and Gypsy or Irish Traveller national counts could not be derived from the projection file at all, because 49 of the 318 areas carry no 20-group detail, so they are now Census 2021 TS021 for England and Wales, 100,981 Roma and 67,768 Gypsy or Irish Traveller, 168,749 between them. Swale, at 0.61%, leads the Gypsy or Irish Traveller list it had been missing from. The NEWETHPOP accuracy distribution's over-10pp bucket reads 20 areas, 7% of the 296 compared. The 86-areas finding keeps its count and its table; its national-picture paragraph is regenerated on the site's own weighting at 74.4% in 2021 across all 318 areas and 56.3% by 2051 across the 312 where 2051 is publishable.",
    sourceUrl: "https://ukdemographics.co.uk/findings/"
  },
  {
    date: "2026-09-07",
    title: "Exposure index regenerated, with an observed language input",
    summary: "The exposure index published one component that scored zero for every area. It read a projected growth in non-English speaking that no script in the pipeline writes, so the field was null for all 318 areas, the component contributed nothing, and a score described as five components was in practice four. The site models ethnic group and nothing else, so no honest projection of language exists to put there. The component now reads an observation instead: the share of residents aged 3 and over whose main language is not English, ONS Census 2021 TS029 via NOMIS, multiplied by 1.0 and capped at 20 points, so 20 points is a 20% share. Like the asylum support rate, it is a level rather than a change, and the index page says so. The whole file was regenerated at the same time, because the published scores had been computed on the projection vintage that model v8.0 replaced on 13 August 2026 and on the 320-area map that the Barnsley and Sheffield duplicate-code fix cut to 318. Between the three causes, 98 of the 318 areas move band, all of them upward, and the high exposure band grows from 17 areas to 59. The 42 areas entering that band do so on the language component: it gives them between 7 and 20 points, a median of 17, and not one of them would reach 70 on the other four components alone. Barnsley and Sheffield pick up the asylum support rate they had been scoring zero on, because the Home Office file keys them on codes the model does not use. The place pages also drop an item labelled projected non-English growth, which was the fall in the White British share with its sign reversed and measured nothing about language. See pull request 65.",
    sourceUrl: "https://ukdemographics.co.uk/pressure/"
  },
  {
    date: "2026-05-20",
    title: "Site audit and corrections",
    summary: "Reconciled the NEWETHPOP MAE figures across findings and methodology. National headline figures (White British share 2011 / 2021 / 2051 / 2061) are now computed live from the projection data rather than hard-coded. Added null-safety to per-place stat blocks so missing values render \"n/a\" rather than \"undefined%\". Constituency pages now carry a derived demographic snapshot (White British share, foreign-born share), weighted by postcode share and 2021 population. Removed AI-style writing tells (em-dashes, hype words, shouty caps). Expanded modelling acronyms (WBI, CCR, CWR, TFR, SNPP, IPF, MAE, NEWETHPOP, NINo, EAL, DC2101EW, RM021, TS021 / 22 / 27 / 29) in the glossary. Northern Ireland party colours added to the constituency template. Hardcoded \"of 320\" rank labels now derive from the dataset. Sources page expanded to list DWP Stat-Xplore, NOMIS and ONS births data.",
    sourceUrl: "https://ukdemographics.co.uk"
  },
  {
    date: "2026-05-20",
    title: "Per-place MiniMap (Phase 3)",
    summary: "Place and constituency pages now show a thumbnail map highlighting the focal area against neighbouring boundaries. Local authority maps use the indigo brand colour for the focal; constituency maps use the 2024 General Election winner's party colour.",
    sourceUrl: "https://ukdemographics.co.uk"
  },
  {
    date: "2026-08-13",
    title: "Model v8.0, recalibrated on an out-of-sample test",
    summary: "Cohort change ratios are now shrunk toward the national ratio by cell size and capped at 1.65 growth per decade. Both settings were selected on a new validation that fits ratios on Census 2001 to 2011 and forecasts 2021, scored against the actual Census 2021, so the fitting window never touches the target. On that test the model scores MAE 1.56pp on the White British share with a bias of +0.05pp, against 2.82pp and -2.13pp for the settings it replaces. The previous backcast score of 1.71pp has been withdrawn: it fitted on the same two Censuses it was tested against and was measuring the model's own guardrails, not its accuracy. It also had the direction wrong. The old settings were projecting change too fast, not too slow. Two code fixes land with it: births were being sized off the previous projection step's women for male cohorts, and the stochastic run carried its own separate copy of the ratio construction, which is why confidence bands failed to contain their own point estimate in 71% of area-years. Runaway long-horizon projections fall from 177 area-years to 19.",
    sourceUrl: "https://ukdemographics.co.uk/methodology/"
  },
  {
    date: "2026-05-19",
    title: "Coverage parity (P2)",
    summary: "Added 631 Westminster constituency pages with 2024 General Election results, sitting MPs and Personal Independence Payment claimant counts. Constituency-to-local-authority cross-links use postcode-share weights from the ONS pcon-lookup. Three new findings: 24-year NINo arrivals arc, working-and-not-working by passport group (Census 2021 RM021), and 2024 births by mother's country of birth.",
    sourceUrl: "https://ukdemographics.co.uk"
  },
  {
    date: "2026-04-29",
    title: "Model v7.0",
    summary: "Census 2011 DC2101EW (18 groups, observed) replaces the previous proportional-splitting Census 2011 base, so per-area Hamilton-Perry CCRs now derive from direct Census observations at both ends of the calibration window. DfE School Census 2024/25 independent calibration applied to ages 0-5 (20% damped). Per-area MAE published on the methodology page. Backcast MAE reported at the time as 1.71pp against NEWETHPOP 2.58pp. That comparison was withdrawn on 13 August 2026: the backcast fitted on the same endpoints it was tested against, so it measured the guardrails rather than accuracy. See the v8.0 entry above.",
    sourceUrl: "https://ukdemographics.co.uk"
  },
  {
    date: "2026-04-14",
    title: "UK Demographics launch",
    summary: "Initial release: 320 local authority demographic profiles with ethnic projections to 2061. Hamilton-Perry v6.0 model, 20 ethnic groups, Census-direct base, 1,000 Monte Carlo simulations with sigma 0.02 generating 80% and 95% confidence intervals.",
    sourceUrl: "https://ukdemographics.co.uk"
  }
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Newest first. The sort is stable, so entries that share a date keep the order they
 * were written in.
 */
export const RELEASES: readonly ReleaseEntry[] = [...ENTRIES].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The id of an entry on /releases/, and so the fragment of its permanent address. */
export function releaseAnchor(release: ReleaseEntry): string {
  return `${release.date}-${slugify(release.title)}`;
}

/** The permanent address of one entry: the feed's link and guid. */
export function releaseUrl(release: ReleaseEntry): string {
  return `${buildAbsoluteUrl(RELEASES_PATH)}#${releaseAnchor(release)}`;
}

/**
 * The link shown under an entry on /releases/: the page the entry is about, or the
 * outside source it names. Entries that only point at the homepage get none.
 */
export function releaseLink(release: ReleaseEntry): { href: string; label: string; external: boolean } | null {
  let url: URL;
  try {
    url = new URL(release.sourceUrl);
  } catch {
    return null;
  }
  const site = new URL(SITE_URL);
  if (url.host !== site.host) {
    return { href: url.toString(), label: `Source: ${url.host.replace(/^www\./, "")}`, external: true };
  }
  const path = `${url.pathname}${url.hash}`;
  if (path === "/" || path === "") return null;
  return { href: path, label: `See ${path}`, external: false };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * RSS 2.0 wants RFC 822 dates. Entries carry a day and no time, so each is stamped
 * 09:30 UTC, the hour ONS publishes at, which keeps the order within a day stable.
 */
function rfc822(date: string): string {
  if (!ISO_DATE.test(date)) throw new Error(`Release date is not YYYY-MM-DD: ${date}`);
  return new Date(`${date}T09:30:00Z`).toUTCString();
}

/** /feed.xml: RSS 2.0, one item per release entry, newest first. */
export function buildReleasesFeed(releases: readonly ReleaseEntry[] = RELEASES): string {
  const feedUrl = buildAbsoluteUrl(FEED_PATH);
  const items = releases
    .map((release) => {
      const url = escapeXml(releaseUrl(release));
      return (
        `    <item>\n` +
        `      <title>${escapeXml(release.title)}</title>\n` +
        `      <link>${url}</link>\n` +
        `      <guid isPermaLink="true">${url}</guid>\n` +
        `      <pubDate>${rfc822(release.date)}</pubDate>\n` +
        `      <description>${escapeXml(release.summary)}</description>\n` +
        `    </item>`
      );
    })
    .join("\n");
  const newest = releases[0];

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml(FEED_TITLE)}</title>\n` +
    `    <link>${escapeXml(buildAbsoluteUrl(RELEASES_PATH))}</link>\n` +
    `    <description>${escapeXml(RELEASES_DESCRIPTION)}</description>\n` +
    `    <language>en-GB</language>\n` +
    (newest ? `    <lastBuildDate>${rfc822(newest.date)}</lastBuildDate>\n` : "") +
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />\n` +
    (items ? `${items}\n` : "") +
    `  </channel>\n` +
    `</rss>\n`
  );
}
