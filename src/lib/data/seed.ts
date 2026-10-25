import type {
  BudgetCategory,
  CreativeIdea,
  EventRecord,
  Expense,
  Milestone,
  StudioState,
  TimelineItem,
  Vendor,
} from "@/lib/types";

/**
 * Three fully-populated demo events so the studio is never an empty shell on
 * first run: a wedding, a milestone birthday and a community festival.
 * IDs are deterministic so re-seeding never duplicates records.
 */

const now = "2026-10-01T09:00:00.000Z";

const WEDDING_DATE = "2027-06-12";
const BIRTHDAY_DATE = "2026-12-05";
const FESTIVAL_DATE = "2026-11-14";

function baseEvent(
  id: string,
  name: string,
  type: EventRecord["type"],
  date: string,
  location: string,
  guestCount: number,
  totalBudget: number,
  preferences: string,
): EventRecord {
  return {
    id,
    name,
    type,
    date,
    location,
    guestCount,
    currency: "USD",
    totalBudget,
    preferences,
    createdAt: now,
    updatedAt: now,
  };
}

export const DEMO_EVENTS: EventRecord[] = [
  baseEvent(
    "evt_wedding",
    "Amara & Julian's Wedding",
    "wedding",
    WEDDING_DATE,
    "Hazel Barn Estate · Sonoma, CA",
    120,
    48000,
    "Garden-romantic with Mediterranean touches. Candlelit long-table dinner, olive branches and ranunculus, a live string trio for the ceremony and a farm-to-table menu with a coastal wine pairing. No garter toss.",
  ),
  baseEvent(
    "evt_birthday",
    "Priya's 40th · A Night in Marrakech",
    "birthday",
    BIRTHDAY_DATE,
    "The Foundry Loft · Chicago, IL",
    80,
    16500,
    "Warm spice tones, lantern light and layered rugs. Family-style mezze, a live oud player, a henna corner for guests, and a short toast instead of a formal program.",
  ),
  baseEvent(
    "evt_festival",
    "Cedar Grove Harvest Festival",
    "festival",
    FESTIVAL_DATE,
    "Cedar Grove Park · Portland, OR",
    750,
    28000,
    "Family-friendly neighbourhood harvest festival. Local makers market, two acoustic stages, a lantern-making workshop, zero-waste goal, accessibility-first site plan.",
  ),
];

export const DEMO_BUDGET_CATEGORIES: BudgetCategory[] = [
  // Wedding — allocations sum to the $48,000 budget.
  { id: "cat_w1", eventId: "evt_wedding", name: "Venue & rentals", allocated: 9000, committed: 9000, paid: 2700, notes: "Barn + garden, includes tables and Chiavari chairs." },
  { id: "cat_w2", eventId: "evt_wedding", name: "Catering & bar", allocated: 15000, committed: 11400, paid: 3420, notes: "Family-style dinner, beer & wine, 2 servers per 20 guests." },
  { id: "cat_w3", eventId: "evt_wedding", name: "Photography & video", allocated: 6500, committed: 6500, paid: 1950, notes: "8 hours, second shooter, engagement session included." },
  { id: "cat_w4", eventId: "evt_wedding", name: "Florals & decor", allocated: 5000, committed: 3800, paid: 1140, notes: "Olive branches, ranunculus, taper candles." },
  { id: "cat_w5", eventId: "evt_wedding", name: "Music & entertainment", allocated: 3200, committed: 3200, paid: 960, notes: "String trio for ceremony, DJ for reception." },
  { id: "cat_w6", eventId: "evt_wedding", name: "Attire & beauty", allocated: 2800, committed: 2100, paid: 700, notes: "Dress alterations, hair & makeup for 4." },
  { id: "cat_w7", eventId: "evt_wedding", name: "Stationery & signage", allocated: 900, committed: 620, paid: 310, notes: "Save-the-dates mailed; invitations in proofing." },
  { id: "cat_w8", eventId: "evt_wedding", name: "Cake & desserts", allocated: 1300, committed: 900, paid: 250, notes: "Three-tier with olive-oil smash cake." },
  { id: "cat_w9", eventId: "evt_wedding", name: "Officiant & ceremony", allocated: 700, committed: 700, paid: 250, notes: "Officiant fee plus marriage-license copy." },
  { id: "cat_w10", eventId: "evt_wedding", name: "Transportation", allocated: 1100, committed: 0, paid: 0, notes: "Shuttle between hotel and estate — still shopping." },
  { id: "cat_w11", eventId: "evt_wedding", name: "Contingency", allocated: 2500, committed: 0, paid: 0, notes: "Held back for weather cover and last-minute adds." },

  // Milestone birthday — allocations sum to $16,500.
  { id: "cat_b1", eventId: "evt_birthday", name: "Venue & rentals", allocated: 3800, committed: 3800, paid: 1140, notes: "Loft buyout incl. lighting rig and rug install." },
  { id: "cat_b2", eventId: "evt_birthday", name: "Catering & bar", allocated: 4900, committed: 2900, paid: 870, notes: "Mezze stations, mocktail bar, mint tea service." },
  { id: "cat_b3", eventId: "evt_birthday", name: "Music & entertainment", allocated: 1800, committed: 1800, paid: 600, notes: "Oud player 8–10pm, DJ 10pm–close." },
  { id: "cat_b4", eventId: "evt_birthday", name: "Florals & decor", allocated: 1900, committed: 1200, paid: 400, notes: "Lantern canopy, brass vessels, palm fronds." },
  { id: "cat_b5", eventId: "evt_birthday", name: "Photography", allocated: 1200, committed: 1200, paid: 360, notes: "4 hours + same-night gallery." },
  { id: "cat_b6", eventId: "evt_birthday", name: "Attire & beauty", allocated: 900, committed: 0, paid: 0, notes: "Kaftan tailoring and glam — quotes pending." },
  { id: "cat_b7", eventId: "evt_birthday", name: "Invitations & print", allocated: 350, committed: 240, paid: 240, notes: "Letterpress invitations, mailed." },
  { id: "cat_b8", eventId: "evt_birthday", name: "Cake & desserts", allocated: 700, committed: 400, paid: 100, notes: "Cardamom-orange blossom cake + date sweets." },
  { id: "cat_b9", eventId: "evt_birthday", name: "Favors", allocated: 400, committed: 180, paid: 0, notes: "Mini spice jars, hand-labelled." },
  { id: "cat_b10", eventId: "evt_birthday", name: "Contingency", allocated: 550, committed: 0, paid: 0, notes: "Buffer for the loft's overtime clause." },

  // Festival — allocations sum to $28,000.
  { id: "cat_f1", eventId: "evt_festival", name: "Permits & insurance", allocated: 2200, committed: 2200, paid: 2200, notes: "Park use permit, liability policy, food-safety certs." },
  { id: "cat_f2", eventId: "evt_festival", name: "Stage & sound", allocated: 6500, committed: 5400, paid: 1620, notes: "Main stage + acoustic tent, tech crew." },
  { id: "cat_f3", eventId: "evt_festival", name: "Site & rentals", allocated: 4800, committed: 3600, paid: 1080, notes: "Tents, fencing, tables, ADA pathways." },
  { id: "cat_f4", eventId: "evt_festival", name: "Talent & programming", allocated: 4500, committed: 2800, paid: 840, notes: "Two stages, kids' parade, workshop leaders." },
  { id: "cat_f5", eventId: "evt_festival", name: "Food vendor program", allocated: 2400, committed: 0, paid: 0, notes: "Subsidised stalls for 6 local carts." },
  { id: "cat_f6", eventId: "evt_festival", name: "Marketing & print", allocated: 2600, committed: 1900, paid: 950, notes: "Posters, wayfinding, neighbourhood mailers." },
  { id: "cat_f7", eventId: "evt_festival", name: "Staffing & security", allocated: 3000, committed: 1800, paid: 0, notes: "40 volunteers + 2 licensed guards." },
  { id: "cat_f8", eventId: "evt_festival", name: "Accessibility & family zone", allocated: 1300, committed: 900, paid: 450, notes: "ASL interpreter, quiet tent, accessible restrooms." },
  { id: "cat_f9", eventId: "evt_festival", name: "Contingency", allocated: 700, committed: 0, paid: 0, notes: "Rain plan and generator fuel." },
];

export const DEMO_TIMELINE_ITEMS: TimelineItem[] = [
  // Wedding
  { id: "tl_w1", eventId: "evt_wedding", title: "Vendor load-in & setup check", day: WEDDING_DATE, startTime: "14:00", endTime: "15:15", phase: "Pre-event", owner: "Nadia · Planner", notes: "Walk every vendor through the load-in dock; confirm power for the band.", done: false },
  { id: "tl_w2", eventId: "evt_wedding", title: "Guest arrival & welcome drinks", day: WEDDING_DATE, startTime: "15:30", endTime: "16:00", phase: "Guest arrival", owner: "Front-of-house team", notes: "Lavender lemonade + sparkling water; seating chart at the barn doors.", done: false },
  { id: "tl_w3", eventId: "evt_wedding", title: "Ceremony", day: WEDDING_DATE, startTime: "16:00", endTime: "16:45", phase: "Ceremony", owner: "Rev. Okafor", notes: "String trio plays Pachelbel, then seats parents. 25-minute ceremony.", done: false },
  { id: "tl_w4", eventId: "evt_wedding", title: "Cocktail hour & golden-hour photos", day: WEDDING_DATE, startTime: "16:45", endTime: "17:45", phase: "Reception", owner: "Lumen & Grain Photo", notes: "Couple sneaks out at 17:15 for golden-hour portraits in the olive grove.", done: false },
  { id: "tl_w5", eventId: "evt_wedding", title: "Grand entrance & first dance", day: WEDDING_DATE, startTime: "17:45", endTime: "18:15", phase: "Reception", owner: "DJ Marisol", notes: "Entrance song queued; band mics tested at 17:30.", done: false },
  { id: "tl_w6", eventId: "evt_wedding", title: "Dinner service · first courses", day: WEDDING_DATE, startTime: "18:15", endTime: "19:15", phase: "Reception", owner: "Table & Thyme", notes: "Family-style platters, allergen cards on each table.", done: false },
  { id: "tl_w7", eventId: "evt_wedding", title: "Toasts & speeches", day: WEDDING_DATE, startTime: "19:15", endTime: "19:35", phase: "Program", owner: "Maid of honour, best man", notes: "Three toasts max; planner cuts the mic at 5 minutes.", done: false },
  { id: "tl_w8", eventId: "evt_wedding", title: "Dinner service · main course", day: WEDDING_DATE, startTime: "19:35", endTime: "20:20", phase: "Reception", owner: "Table & Thyme", notes: "Fish, beef and a vegan risotto option labelled clearly.", done: false },
  { id: "tl_w9", eventId: "evt_wedding", title: "Cake cutting", day: WEDDING_DATE, startTime: "20:20", endTime: "20:40", phase: "Program", owner: "Couple + planner", notes: "Photographer positioned camera-left; dessert bar opens at the same time.", done: false },
  { id: "tl_w10", eventId: "evt_wedding", title: "Dance floor opens · live trio then DJ", day: WEDDING_DATE, startTime: "20:40", endTime: "22:30", phase: "Program", owner: "DJ Marisol", notes: "Do-not-play list enforced: no cha-cha slide.", done: false },
  { id: "tl_w11", eventId: "evt_wedding", title: "Sparkler send-off", day: WEDDING_DATE, startTime: "22:30", endTime: "22:50", phase: "Wrap-up", owner: "Nadia · Planner", notes: "Fire bucket + attendants at both ends of the path.", done: false },
  { id: "tl_w12", eventId: "evt_wedding", title: "Vendor breakdown & load-out", day: WEDDING_DATE, startTime: "23:00", endTime: "23:50", phase: "Wrap-up", owner: "Nadia · Planner", notes: "Rentals pickup is Sunday 9am — do not stack chairs on the lawn.", done: false },

  // Milestone birthday
  { id: "tl_b1", eventId: "evt_birthday", title: "Lantern & rug install", day: BIRTHDAY_DATE, startTime: "17:00", endTime: "18:30", phase: "Pre-event", owner: "Lantern & Loam Rentals", notes: "Dimmable warm bulbs only; no white light on the rug floor.", done: false },
  { id: "tl_b2", eventId: "evt_birthday", title: "Doors, welcome mint tea & henna corner opens", day: BIRTHDAY_DATE, startTime: "19:00", endTime: "19:45", phase: "Guest arrival", owner: "Host committee", notes: "Guest book doubles as a blessing jar for Priya.", done: false },
  { id: "tl_b3", eventId: "evt_birthday", title: "Family-style mezze dinner", day: BIRTHDAY_DATE, startTime: "19:45", endTime: "20:45", phase: "Reception", owner: "Saffron Table", notes: "Vegetarian mezze first, lamb tagine second wave.", done: false },
  { id: "tl_b4", eventId: "evt_birthday", title: "Toast, cake & birthday wish", day: BIRTHDAY_DATE, startTime: "20:45", endTime: "21:05", phase: "Program", owner: "Sister · host", notes: "Short 10-minute toast; cake served with cardamom coffee.", done: false },
  { id: "tl_b5", eventId: "evt_birthday", title: "Oud set", day: BIRTHDAY_DATE, startTime: "21:00", endTime: "22:00", phase: "Program", owner: "Nour & Sound", notes: "Acoustic corner by the lantern wall; dancing space stays clear.", done: false },
  { id: "tl_b6", eventId: "evt_birthday", title: "Dance floor & DJ", day: BIRTHDAY_DATE, startTime: "22:00", endTime: "23:45", phase: "Program", owner: "DJ Rami", notes: "Bollywood + afrobeats block at 22:40.", done: false },
  { id: "tl_b7", eventId: "evt_birthday", title: "Last call, favors & send-off", day: BIRTHDAY_DATE, startTime: "23:45", endTime: "00:15", phase: "Wrap-up", owner: "Host committee", notes: "Spice-jar favors by the coat check; Ubers called at 23:50.", done: false },

  // Festival
  { id: "tl_f1", eventId: "evt_festival", title: "Site build, tents & fence line", day: FESTIVAL_DATE, startTime: "07:00", endTime: "09:30", phase: "Pre-event", owner: "Cascade Rentals + crew", notes: "ADA pathway from the north lot must be first, not last.", done: false },
  { id: "tl_f2", eventId: "evt_festival", title: "Vendor check-in & health permits", day: FESTIVAL_DATE, startTime: "09:30", endTime: "10:45", phase: "Pre-event", owner: "Green Team leads", notes: "Every food cart shows a permit before power is connected.", done: false },
  { id: "tl_f3", eventId: "evt_festival", title: "Gates open · makers market & family zone", day: FESTIVAL_DATE, startTime: "11:00", endTime: "17:30", phase: "Guest arrival", owner: "Volunteer desk", notes: "6 entry lanes, 2 staffed with ASL-trained volunteers.", done: false },
  { id: "tl_f4", eventId: "evt_festival", title: "Opening ceremony & land acknowledgement", day: FESTIVAL_DATE, startTime: "11:30", endTime: "11:50", phase: "Ceremony", owner: "Community elders", notes: "Mic check at 11:00; seated viewing area reserved at stage left.", done: false },
  { id: "tl_f5", eventId: "evt_festival", title: "Acoustic stage · morning sets", day: FESTIVAL_DATE, startTime: "12:00", endTime: "14:00", phase: "Program", owner: "Portland Sound Co", notes: "45-minute sets, 15-minute changeovers.", done: false },
  { id: "tl_f6", eventId: "evt_festival", title: "Kids' lantern parade", day: FESTIVAL_DATE, startTime: "14:00", endTime: "15:00", phase: "Program", owner: "Family zone volunteers", notes: "Staging at the willow grove; 2 marshals per 10 kids.", done: false },
  { id: "tl_f7", eventId: "evt_festival", title: "Headliner set", day: FESTIVAL_DATE, startTime: "17:30", endTime: "19:00", phase: "Program", owner: "Portland Sound Co", notes: "Curfew is 19:00 sharp per park permit.", done: false },
  { id: "tl_f8", eventId: "evt_festival", title: "Lantern lighting & community sing", day: FESTIVAL_DATE, startTime: "19:00", endTime: "19:45", phase: "Program", owner: "Volunteer choir", notes: "LED candles only — open flame is prohibited in the park.", done: false },
  { id: "tl_f9", eventId: "evt_festival", title: "Gates close & waste sweep", day: FESTIVAL_DATE, startTime: "20:00", endTime: "20:45", phase: "Wrap-up", owner: "Green Loop Waste", notes: "Three-stream sorting: compost, recycle, landfill audit.", done: false },
  { id: "tl_f10", eventId: "evt_festival", title: "Site strike & load-out", day: FESTIVAL_DATE, startTime: "20:45", endTime: "22:30", phase: "Wrap-up", owner: "Cascade Rentals + crew", notes: "Park inspection with ranger at 22:30.", done: false },
];

export const DEMO_MILESTONES: Milestone[] = [
  // Wedding
  { id: "ms_w1", eventId: "evt_wedding", title: "Book caterer & lock menu tasting", dueDate: "2026-10-18", done: true },
  { id: "ms_w2", eventId: "evt_wedding", title: "Mail save-the-dates", dueDate: "2026-11-01", done: false },
  { id: "ms_w3", eventId: "evt_wedding", title: "Sign florist proposal", dueDate: "2026-11-20", done: false },
  { id: "ms_w4", eventId: "evt_wedding", title: "Second dress fitting", dueDate: "2027-02-14", done: false },
  { id: "ms_w5", eventId: "evt_wedding", title: "Apply for marriage license", dueDate: "2027-05-10", done: false },
  { id: "ms_w6", eventId: "evt_wedding", title: "Final guest count to caterer", dueDate: "2027-05-28", done: false },

  // Birthday
  { id: "ms_b1", eventId: "evt_birthday", title: "Confirm henna artist & contract", dueDate: "2026-10-12", done: true },
  { id: "ms_b2", eventId: "evt_birthday", title: "Mail letterpress invitations", dueDate: "2026-10-30", done: true },
  { id: "ms_b3", eventId: "evt_birthday", title: "Lock RSVP count & seating", dueDate: "2026-11-15", done: false },
  { id: "ms_b4", eventId: "evt_birthday", title: "Final menu walkthrough with Saffron Table", dueDate: "2026-11-22", done: false },

  // Festival
  { id: "ms_f1", eventId: "evt_festival", title: "Submit park use permit & insurance certs", dueDate: "2026-09-15", done: true },
  { id: "ms_f2", eventId: "evt_festival", title: "Confirm 8 food vendors", dueDate: "2026-10-10", done: true },
  { id: "ms_f3", eventId: "evt_festival", title: "Recruit 40 volunteers", dueDate: "2026-10-26", done: false },
  { id: "ms_f4", eventId: "evt_festival", title: "Print wayfinding & accessibility signage", dueDate: "2026-11-01", done: false },
  { id: "ms_f5", eventId: "evt_festival", title: "Run-of-show rehearsal with stage leads", dueDate: "2026-11-10", done: false },
];

export const DEMO_VENDORS: Vendor[] = [
  // Wedding
  { id: "vn_w1", eventId: "evt_wedding", category: "Venue", name: "Hazel Barn Estate", contactName: "Grace Whitfield", email: "events@hazelbarn.example", phone: "(707) 555-0142", status: "contracted", quote: 9000, contractValue: 9000, depositAmount: 4500, depositPaid: 2700, inquiryDate: "2026-07-14", followUpDate: "2026-11-15", notes: "Saturday buyout 10am–midnight. Rain plan: glasshouse, no extra fee.", checklist: [
    { id: "qw1a", text: "Confirm the glasshouse rain plan holds at no extra fee", done: true },
    { id: "qw1b", text: "Send certificate of insurance naming the estate", done: false },
    { id: "qw1c", text: "Confirm load-in access from 10:00 on the day", done: false },
  ] },
  { id: "vn_w2", eventId: "evt_wedding", category: "Catering", name: "Table & Thyme", contactName: "Marcus Ibarra", email: "marcus@tableandthyme.example", phone: "(415) 555-0188", status: "quoted", quote: 11400, contractValue: 0, depositAmount: 3420, depositPaid: 0, inquiryDate: "2026-10-05", followUpDate: "2026-10-28", notes: "Family-style, 3 mains. Tasting booked for November.", checklist: [
    { id: "qw2a", text: "Can you cover 120 covers with your current staffing?", done: true },
    { id: "qw2b", text: "Which dietary requirements can you handle (GF, vegan, nut)?", done: false },
    { id: "qw2c", text: "How many staff on site for setup, service and cleanup?", done: false },
    { id: "qw2d", text: "What is the payment schedule and cancellation window?", done: false },
  ] },
  { id: "vn_w3", eventId: "evt_wedding", category: "Photography", name: "Lumen & Grain", contactName: "Sofia Reyes", email: "hello@lumengrain.example", phone: "(415) 555-0110", status: "deposit", quote: 6500, contractValue: 6500, depositAmount: 1950, depositPaid: 1950, inquiryDate: "2026-07-22", followUpDate: "2026-11-08", notes: "8 hours, second shooter, engagement session Nov 8.", checklist: [
    { id: "qw3a", text: "Coverage hours confirmed: 10:00 through last dance", done: true },
    { id: "qw3b", text: "Deliverables: edited gallery, print rights, album options", done: true },
    { id: "qw3c", text: "Delivery time for the full gallery after the wedding", done: false },
    { id: "qw3d", text: "Backup camera bodies and a second shooter on call?", done: false },
  ] },
  { id: "vn_w4", eventId: "evt_wedding", category: "Florals", name: "Fern & Fo Studio", contactName: "Ida Kowalski", email: "ida@fernandfo.example", phone: "(707) 555-0173", status: "inquiry", quote: 3800, contractValue: 0, depositAmount: 1140, depositPaid: 0, inquiryDate: "2026-10-12", followUpDate: "2026-10-22", notes: "Proposal v2 pending — asked to swap peonies for ranunculus.", checklist: [
    { id: "qw4a", text: "Is the ranunculus swap available at the same price?", done: false },
    { id: "qw4b", text: "Delivery and install window on the wedding day?", done: false },
  ] },
  { id: "vn_w5", eventId: "evt_wedding", category: "Entertainment", name: "Golden Hour Trio", contactName: "Peter Lund", email: "booking@goldenhourtrio.example", phone: "(415) 555-0121", status: "contracted", quote: 3200, contractValue: 3200, depositAmount: 1600, depositPaid: 960, inquiryDate: "2026-08-03", followUpDate: "2026-11-20", notes: "Ceremony + cocktails, 2 sets of 45 minutes.", checklist: [
    { id: "qw5a", text: "PA and power supplied, or do we hire sound separately?", done: true },
    { id: "qw5b", text: "Rain date and overtime terms in the contract", done: false },
  ] },
  { id: "vn_w6", eventId: "evt_wedding", category: "Attire", name: "Velvet Row Bridal", contactName: "Ana Duarte", email: "ana@velvetrow.example", phone: "(415) 555-0155", status: "deposit", quote: 2100, contractValue: 2100, depositAmount: 700, depositPaid: 700, inquiryDate: "2026-06-20", followUpDate: "2026-12-05", notes: "Dress ordered; alterations start February.", checklist: [
    { id: "qw6a", text: "Alterations schedule fits the February window", done: false },
  ] },
  { id: "vn_w7", eventId: "evt_wedding", category: "Stationery", name: "Ink & Ivory Press", contactName: "Hannah Cho", email: "studio@inkivory.example", phone: "(510) 555-0164", status: "deposit", quote: 620, contractValue: 620, depositAmount: 310, depositPaid: 620, inquiryDate: "2026-06-02", followUpDate: "2026-11-10", notes: "Save-the-dates delivered. Invitations in proofing.", checklist: [
    { id: "qw7a", text: "Invitation proof sign-off before the print run", done: true },
    { id: "qw7b", text: "Guest addressing and postage handled by the printer?", done: true },
  ] },
  { id: "vn_w8", eventId: "evt_wedding", category: "Cake", name: "Sweet Marrow Bakehouse", contactName: "Elena Petrov", email: "elena@sweetmarrow.example", phone: "(707) 555-0198", status: "quoted", quote: 900, contractValue: 0, depositAmount: 270, depositPaid: 0, inquiryDate: "2026-10-08", followUpDate: "2026-11-01", notes: "Quote includes olive-oil smash cake and gluten-free tier.", checklist: [
    { id: "qw8a", text: "Delivery window and on-site cutting service?", done: false },
    { id: "qw8b", text: "Gluten-free tier prepared in a separate kitchen?", done: false },
  ] },
  { id: "vn_w9", eventId: "evt_wedding", category: "Officiant", name: "Rev. Daniel Okafor", contactName: "Daniel Okafor", email: "daniel@okafor.example", phone: "(707) 555-0107", status: "contracted", quote: 700, contractValue: 700, depositAmount: 350, depositPaid: 250, inquiryDate: "2026-08-19", followUpDate: "2026-12-15", notes: "Vow workshop scheduled for January.", checklist: [
    { id: "qw9a", text: "Ceremony script reviewed and approved by both families", done: false },
  ] },

  // Birthday
  { id: "vn_b1", eventId: "evt_birthday", category: "Venue", name: "The Foundry Loft", contactName: "Dana Kim", email: "bookings@foundryloft.example", phone: "(312) 555-0133", status: "deposit", quote: 3800, contractValue: 3800, depositAmount: 1140, depositPaid: 1140, inquiryDate: "2026-08-11", followUpDate: "2026-11-30", notes: "Buyout 5pm–1am. Overtime is $250/hour.", checklist: [
    { id: "qb1a", text: "Is the loft fully accessible — step-free entry and restrooms?", done: true },
    { id: "qb1b", text: "Noise restrictions and hard curfew for the DJ set?", done: true },
    { id: "qb1b2", text: "Cancellation terms if the guest count drops sharply", done: false },
  ] },
  { id: "vn_b2", eventId: "evt_birthday", category: "Catering", name: "Saffron Table", contactName: "Omar Haddad", email: "omar@saffrontable.example", phone: "(312) 555-0192", status: "deposit", quote: 2900, contractValue: 2900, depositAmount: 870, depositPaid: 870, inquiryDate: "2026-09-02", followUpDate: "2026-12-10", notes: "Mezze stations + mint tea service. Mocktail bar included.", checklist: [
    { id: "qb2a", text: "Halal and alcohol-free options confirmed for every station", done: true },
    { id: "qb2b", text: "Setup and breakdown windows included in the quote", done: false },
  ] },
  { id: "vn_b3", eventId: "evt_birthday", category: "Entertainment", name: "Nour & Sound", contactName: "Nour Khalil", email: "nour@noursound.example", phone: "(312) 555-0149", status: "contracted", quote: 1800, contractValue: 1800, depositAmount: 900, depositPaid: 600, inquiryDate: "2026-09-20", followUpDate: "2026-12-01", notes: "Oud 9–10pm; DJ Rami takes over at 10pm.", checklist: [
    { id: "qb3a", text: "Who supplies the PA and who runs soundcheck?", done: false },
    { id: "qb3b", text: "Changeover time between the oud set and the DJ", done: false },
  ] },
  { id: "vn_b4", eventId: "evt_birthday", category: "Decoration", name: "Lantern & Loam", contactName: "Ruth Alvarez", email: "ruth@lanternloam.example", phone: "(312) 555-0187", status: "inquiry", quote: 1200, contractValue: 0, depositAmount: 0, depositPaid: 0, inquiryDate: "2026-10-18", followUpDate: "2026-10-26", notes: "Lantern canopy + 14 rugs. Awaiting final install map.", checklist: [
    { id: "qb4a", text: "Install map for the lantern canopy over the rug floor", done: false },
    { id: "qb4b", text: "Strike window after 1am included in the quote?", done: false },
  ] },
  { id: "vn_b5", eventId: "evt_birthday", category: "Photography", name: "Cedar Street Photo", contactName: "Leo Fontaine", email: "leo@cedarstreetphoto.example", phone: "(312) 555-0119", status: "quoted", quote: 1200, contractValue: 0, depositAmount: 360, depositPaid: 0, inquiryDate: "2026-10-09", followUpDate: "2026-10-30", notes: "4 hours + same-night gallery of 60 images.", checklist: [
    { id: "qb5a", text: "Delivery time: same-night gallery guaranteed?", done: true },
    { id: "qb5b", text: "Backup body and dual card slots on the night?", done: false },
  ] },
  { id: "vn_b6", eventId: "evt_birthday", category: "Entertainment", name: "Henna by Leila", contactName: "Leila Nasser", email: "leila@henna.example", phone: "(312) 555-0176", status: "prospect", quote: 550, contractValue: 0, depositAmount: 0, depositPaid: 0, inquiryDate: "", followUpDate: "2026-11-05", notes: "Two artists, 3-hour block. Check December availability.", checklist: [] },

  // Festival
  { id: "vn_f1", eventId: "evt_festival", category: "Permits", name: "Cedar Grove Parks Dept.", contactName: "Ranger Yvonne Blake", email: "parks@cedargrove.example", phone: "(503) 555-0100", status: "deposit", quote: 900, contractValue: 900, depositAmount: 900, depositPaid: 900, inquiryDate: "2026-07-30", followUpDate: "2026-11-10", notes: "Park use permit approved; 19:00 sound curfew.", checklist: [
    { id: "qf1a", text: "Permit conditions filed — sound curfew at 19:00", done: true },
    { id: "qf1b", text: "Waste, toilet and accessibility conditions attached?", done: true },
  ] },
  { id: "vn_f2", eventId: "evt_festival", category: "Sound", name: "Portland Sound Co.", contactName: "Ty Brennan", email: "ty@portlandsound.example", phone: "(503) 555-0155", status: "contracted", quote: 5400, contractValue: 5400, depositAmount: 2700, depositPaid: 1620, inquiryDate: "2026-08-25", followUpDate: "2026-11-02", notes: "Main stage + acoustic tent, 3 tech crew, curfew plan.", checklist: [
    { id: "qf2a", text: "Load-in window and power requirements for both stages", done: true },
    { id: "qf2b", text: "Public liability insurance certificate on file", done: false },
    { id: "qf2c", text: "Noise monitoring plan for the 19:00 curfew", done: false },
  ] },
  { id: "vn_f3", eventId: "evt_festival", category: "Rentals", name: "Cascade Rentals", contactName: "Marta Silva", email: "marta@cascaderentals.example", phone: "(503) 555-0121", status: "contracted", quote: 3600, contractValue: 3600, depositAmount: 1800, depositPaid: 1080, inquiryDate: "2026-09-05", followUpDate: "2026-11-06", notes: "2× 20×40 tents, fencing, 30 tables, ADA pathways.", checklist: [
    { id: "qf3a", text: "Anchoring method — stakes or ballast on the lawn?", done: true },
    { id: "qf3b", text: "Delivery window before gates open at 11:00", done: false },
    { id: "qf3c", text: "Rain contingency and emergency breakdown crew", done: false },
  ] },
  { id: "vn_f4", eventId: "evt_festival", category: "Entertainment", name: "Bright Field Talent", contactName: "Jordan Pike", email: "jordan@brightfield.example", phone: "(503) 555-0198", status: "quoted", quote: 2800, contractValue: 0, depositAmount: 840, depositPaid: 0, inquiryDate: "2026-10-06", followUpDate: "2026-10-20", notes: "Booking 5 acts across two stages; headliner contract pending.", checklist: [
    { id: "qf4a", text: "Are rider and hospitality costs inside the quoted fee?", done: false },
    { id: "qf4b", text: "Technical rider received for both stages?", done: false },
  ] },
  { id: "vn_f5", eventId: "evt_festival", category: "Security", name: "Rose City Safety", contactName: "Andre Wells", email: "andre@rosecitysafety.example", phone: "(503) 555-0143", status: "inquiry", quote: 1800, contractValue: 0, depositAmount: 0, depositPaid: 0, inquiryDate: "2026-10-14", followUpDate: "2026-10-26", notes: "2 licensed guards, 10-hour block. Requesting certificates.", checklist: [
    { id: "qf5a", text: "Insurance and licensing certificates before booking", done: false },
    { id: "qf5b", text: "Safety and evacuation plan for 2,000 attendees", done: false },
  ] },
  { id: "vn_f6", eventId: "evt_festival", category: "Waste", name: "Green Loop Waste", contactName: "Priya Raman", email: "priya@greenloop.example", phone: "(503) 555-0166", status: "prospect", quote: 700, contractValue: 0, depositAmount: 0, depositPaid: 0, inquiryDate: "", followUpDate: "", notes: "Three-stream sorting + compost audit report.", checklist: [] },
  { id: "vn_f7", eventId: "evt_festival", category: "Community sponsors", name: "Willow & Pine Makers Coop", contactName: "Sam Okafor", email: "coop@willowpine.example", phone: "(503) 555-0188", status: "deposit", quote: 900, contractValue: 900, depositAmount: 450, depositPaid: 450, inquiryDate: "2026-09-12", followUpDate: "2026-11-12", notes: "18 maker stalls; shared power plan submitted.", checklist: [
    { id: "qf7a", text: "Stall power loads confirmed for the shared plan", done: true },
    { id: "qf7b", text: "Each maker carries their own public liability cover", done: false },
  ] },
];

export const DEMO_IDEAS: CreativeIdea[] = [
  // Wedding
  { id: "id_w1", eventId: "evt_wedding", kind: "theme", title: "Candlelit Olive Grove", description: "A Mediterranean garden supper: olive branches, taper candles in brass, linen runners and hand-glazed ceramic place cards. Warm, quiet luxury rather than ballroom formality.", rationale: "Matches the estate's olive allee and the couple's preference for quiet luxury over ballroom formality; reads beautifully in candlelight after dark.", implementationNotes: "Brief the florist on olive branch quantity (≈40ft of runner), rent brass candlesticks in three heights, and confirm open-flame rules with the venue.", costLow: 900, costHigh: 1800, palette: ["#C5A059", "#8A9A7B", "#F3EFEA", "#2A2520"], favorite: true, source: "manual" },
  { id: "id_w2", eventId: "evt_wedding", kind: "decor", title: "Long Tables Under the Trees", description: "Three 24-foot farm tables down the olive allee, each strung with low bistro lights. No elevated centerpieces — greenery runs the length of the table so guests can see each other.", rationale: "Long tables suit 120 guests in a narrow allee, keep the acoustics intimate, and remove sightline problems that elevated centerpieces create.", implementationNotes: "Rent 3× 24ft tables + 120 chairs, run one bistro-light strand per table at 30in height, and anchor greenery with weighted pins so wind doesn't lift it.", costLow: 1400, costHigh: 2600, palette: [], favorite: false, source: "manual" },
  { id: "id_w3", eventId: "evt_wedding", kind: "menu", title: "Coastal Mediterranean Tasting Menu", description: "Family-style: burrata with charred grapes, whole roasted branzino, lemon-orecchiette, olive-oil cake. Sonoma wines paired by the glass, plus a shrub mocktail for the toast.", rationale: "Family-style service at long tables keeps the meal communal and lands inside the catering budget per head; shrub mocktail means non-drinkers share the toast.", implementationNotes: "Confirm branzino yield per whole fish (1 per 2 guests), batch shrubs 3 days ahead, and lock the wine-by-the-glass pour with the caterer.", costLow: 75, costHigh: 110, palette: [], favorite: true, source: "manual" },
  { id: "id_w4", eventId: "evt_wedding", kind: "activity", title: "Late-Night Espresso & Churros Bar", description: "A cart rolls out at 22:00 with espresso, churros and a build-your-own chocolate dipping sauce. Keeps the dance floor alive through the last hour.", rationale: "An energy second wind at 22:00 counters the post-dinner dip and gives the late crowd a reason to stay until the midnight send-off.", implementationNotes: "Book a mobile cart for 90 minutes, pre-order 150 churros, and schedule service away from the speeches window.", costLow: 600, costHigh: 1100, palette: [], favorite: false, source: "manual" },
  { id: "id_w5", eventId: "evt_wedding", kind: "palette", title: "Olive Grove at Dusk", description: "Champagne gold against deep ink and dusty olive, softened by warm linen. Reads expensive in candlelight and photographs beautifully.", rationale: "Takes its cues from the venue's own olive trees and the golden hour the photographer's engagement session will shoot in.", implementationNotes: "Use ink for suits and menu cards, olive for linens, gold only as metal accents — never more than 10% of any surface.", costLow: 0, costHigh: 0, palette: ["#C5A059", "#8A9A7B", "#EFE7D8", "#2A2520"], favorite: false, source: "manual" },

  // Birthday
  { id: "id_b1", eventId: "evt_birthday", kind: "theme", title: "A Night in Marrakech", description: "Lantern light, layered rugs and spice-market colour. Guests enter through a draped archway into warm amber light; brass trays double as serving surfaces.", rationale: "Matches the birthday host's love of spice markets and warm amber lighting; the loft's brick shell takes layered textiles well.", implementationNotes: "Rent a 14-piece lantern canopy, source 6 overlapping rugs (non-slip pads underneath), and drape the entry arch so fire codes keep one clear exit.", costLow: 1800, costHigh: 3200, palette: ["#C5A059", "#B4553A", "#6B7A5A", "#2A2520"], favorite: true, source: "manual" },
  { id: "id_b2", eventId: "evt_birthday", kind: "menu", title: "Family-Style Mezze Feast", description: "Lamb tagine, roasted carrot and harissa, saffron rice, warm flatbread, and a cardamom-orange-blossom cake. Mint tea poured tableside at the close.", rationale: "Sharing platters suit a standing-room loft for 65, keep the mocktail bar company, and travel well from the caterer's kitchen.", implementationNotes: "Confirm two vegetarian mains, keep harissa on the side for kids, and schedule the tea service 20 minutes before the cake.", costLow: 55, costHigh: 85, palette: [], favorite: false, source: "manual" },
  { id: "id_b3", eventId: "evt_birthday", kind: "activity", title: "Henna & Blessing Jar", description: "Two henna artists for three hours, alongside a blessing jar where guests write what they wish for Priya in the next decade.", rationale: "Two artists clear roughly 6 guests per hour, so the line stays short; the blessing jar doubles as the keepsake guests take home.", implementationNotes: "Seat artists near good light with a 6ft table, print cards matching the palette, and assign someone to read jar notes at the toast.", costLow: 550, costHigh: 900, palette: [], favorite: false, source: "manual" },

  // Festival
  { id: "id_f1", eventId: "evt_festival", kind: "theme", title: "Harvest at Dusk", description: "A community harvest celebration that shifts from bright afternoon market to lantern-lit evening singalong. Everything is reusable, borrowed or compostable.", rationale: "Borrows the season's own harvest palette, supports the festival's zero-waste pledge, and earns goodwill from council sponsors.", implementationNotes: "Publish a materials list for sponsors (reusable only), add compost signage at every bin pair, and stage the lantern lighting for 19:00 curfew.", costLow: 700, costHigh: 1400, palette: ["#C5A059", "#A4552E", "#7C8B5B", "#EFE7D8"], favorite: true, source: "manual" },
  { id: "id_f2", eventId: "evt_festival", kind: "activity", title: "Lantern-Making Workshop", description: "Volunteers run a paper-lantern workshop from 13:00; the finished lanterns become the 19:00 community lighting. Zero-waste by design.", rationale: "Turns a free afternoon activity into the evening's headline moment, with materials that compost instead of landfill.", implementationNotes: "Pre-cut 400 paper frames, station 4 volunteer leads, and collect lanterns into a fire-safe staging area before dusk.", costLow: 250, costHigh: 500, palette: [], favorite: false, source: "manual" },
  { id: "id_f3", eventId: "evt_festival", kind: "menu", title: "Local Food Cart Collective", description: "Subsidised stalls for six neighbourhood carts — one per world-food quadrant of the park, plus a free water refill station to cut plastic.", rationale: "Spreads spend across local businesses, keeps per-head food cost predictable for 2,000 attendees, and supports the no-plastic pledge.", implementationNotes: "Confirm each cart's health permit before power connection, map queues away from the stage, and place refill stations at both entrances.", costLow: 2400, costHigh: 3600, palette: [], favorite: false, source: "manual" },
];

/**
 * Expense ledger entries for the demo events. These are deliberately distinct
 * from the categories' direct `paid` values so totals never double-count:
 * category.paid = payments logged before itemising, expenses = itemised
 * transactions (some settled, some still outstanding).
 */
export const DEMO_EXPENSES: Expense[] = [
  // Wedding
  { id: "exp_w1", eventId: "evt_wedding", categoryId: "cat_w1", title: "Barn rental — second installment", amount: 3600, date: "2026-11-15", paid: false, notes: "Invoice net-30; scheduled for the November retainer run." },
  { id: "exp_w2", eventId: "evt_wedding", categoryId: "cat_w2", title: "Menu tasting for six", amount: 450, date: "2026-10-02", paid: true, notes: "Credited against the final catering invoice." },
  { id: "exp_w3", eventId: "evt_wedding", categoryId: "cat_w3", title: "Engagement session", amount: 600, date: "2026-11-08", paid: true, notes: "Golden-hour shoot in the olive grove; gallery in 3 weeks." },
  { id: "exp_w4", eventId: "evt_wedding", categoryId: "cat_w4", title: "Florist proposal retainer", amount: 800, date: "2026-11-20", paid: false, notes: "Held until the peony → ranunculus swap is approved." },
  { id: "exp_w5", eventId: "evt_wedding", categoryId: "cat_w7", title: "Save-the-date printing & postage", amount: 145, date: "2026-10-20", paid: true, notes: "90 cards, tracked mail." },

  // Milestone birthday
  { id: "exp_b1", eventId: "evt_birthday", categoryId: "cat_b1", title: "Lighting rig add-on", amount: 450, date: "2026-11-12", paid: true, notes: "Warm-dim cans for the rug floor — no white light." },
  { id: "exp_b2", eventId: "evt_birthday", categoryId: "cat_b2", title: "Mocktail bar deposit", amount: 300, date: "2026-11-25", paid: false, notes: "Due with the final headcount confirmation." },
  { id: "exp_b3", eventId: "evt_birthday", categoryId: "cat_b5", title: "Second shooter hold", amount: 240, date: "2026-12-01", paid: false, notes: "Optional add-on — decide after RSVP close." },
  { id: "exp_b4", eventId: "evt_birthday", categoryId: "cat_b7", title: "Invitation postage", amount: 96, date: "2026-10-18", paid: true, notes: "62 letterpress invites, hand-cancelled." },

  // Festival
  { id: "exp_f1", eventId: "evt_festival", categoryId: "cat_f1", title: "Liability policy premium", amount: 620, date: "2026-09-20", paid: true, notes: "$2M coverage; certificate filed with the parks department." },
  { id: "exp_f2", eventId: "evt_festival", categoryId: "cat_f2", title: "Stage power run & distro", amount: 350, date: "2026-10-30", paid: false, notes: "Generator cabling from the north lot — quote pending final route." },
  { id: "exp_f3", eventId: "evt_festival", categoryId: "cat_f6", title: "Poster print run (500)", amount: 480, date: "2026-10-08", paid: true, notes: "Recycled stock, delivered to 40 neighbourhood locations." },
  { id: "exp_f4", eventId: "evt_festival", categoryId: "cat_f8", title: "ASL interpreter deposit", amount: 300, date: "2026-10-22", paid: false, notes: "Two interpreters, 6-hour block; balance due at event." },
];

/** Builds the complete seeded state used on first run and after a reset. */
export function createSeedState(): StudioState {
  return {
    version: 1,
    events: DEMO_EVENTS,
    budgetCategories: DEMO_BUDGET_CATEGORIES,
    expenses: DEMO_EXPENSES,
    timelineItems: DEMO_TIMELINE_ITEMS,
    milestones: DEMO_MILESTONES,
    vendors: DEMO_VENDORS,
    ideas: DEMO_IDEAS,
    activeEventId: DEMO_EVENTS[0].id,
  };
}
