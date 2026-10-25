import { describe, expect, it } from "vitest";
import {
  checklistProgress,
  committedValue,
  depositState,
  normalizeVendor,
  vendorBalance,
} from "./vendor";
import { vendorProgress } from "./selectors";
import type { Vendor, VendorStatus } from "@/lib/types";

function vendor(overrides: Partial<Vendor> & { id: string }): Vendor {
  return {
    eventId: "evt_1",
    category: "Catering",
    name: `Vendor ${overrides.id}`,
    contactName: "",
    email: "",
    phone: "",
    status: "prospect",
    quote: 0,
    contractValue: 0,
    depositAmount: 0,
    depositPaid: 0,
    inquiryDate: "",
    followUpDate: "",
    notes: "",
    checklist: [],
    ...overrides,
  };
}

describe("committedValue", () => {
  it("is zero while the vendor is still negotiating", () => {
    for (const status of ["prospect", "inquiry", "quoted"] as VendorStatus[]) {
      expect(
        committedValue(vendor({ id: status, status, quote: 5000, contractValue: 4000 })),
      ).toBe(0);
    }
  });

  it("uses the contract value once signed", () => {
    expect(
      committedValue(
        vendor({ id: "c", status: "contracted", quote: 5000, contractValue: 4600 }),
      ),
    ).toBe(4600);
  });

  it("falls back to the quote when the contract value wasn't recorded", () => {
    expect(
      committedValue(
        vendor({ id: "c", status: "contracted", quote: 3200, contractValue: 0 }),
      ),
    ).toBe(3200);
  });
});

describe("vendorBalance", () => {
  it("subtracts deposits from the commitment but never goes negative", () => {
    const overpaid = vendor({
      id: "v",
      status: "contracted",
      contractValue: 1000,
      depositPaid: 1500,
    });
    expect(vendorBalance(overpaid)).toBe(0);
  });

  it("is zero for unsigned vendors regardless of money paid", () => {
    const prospect = vendor({ id: "v", status: "prospect", quote: 4000, depositPaid: 500 });
    expect(vendorBalance(prospect)).toBe(0);
  });
});

describe("depositState", () => {
  it("classifies none / due / partial / settled", () => {
    expect(depositState(vendor({ id: "1" }))).toBe("none");
    expect(
      depositState(vendor({ id: "2", depositAmount: 900, depositPaid: 0 })),
    ).toBe("due");
    expect(
      depositState(vendor({ id: "3", depositAmount: 900, depositPaid: 450 })),
    ).toBe("partial");
    expect(
      depositState(vendor({ id: "4", depositAmount: 900, depositPaid: 900 })),
    ).toBe("settled");
  });
});

describe("vendorProgress totals — no double counting", () => {
  const vendors = [
    vendor({ id: "prospect", status: "prospect", quote: 1000 }),
    vendor({
      id: "signed",
      status: "contracted",
      quote: 5000,
      contractValue: 5000,
      depositPaid: 1000,
    }),
    vendor({
      id: "deposited",
      status: "deposit",
      quote: 2000,
      contractValue: 2000,
      depositAmount: 2000,
      depositPaid: 2000,
    }),
  ];

  const totals = vendorProgress(vendors);

  it("counts every quote in the quoted pipeline value", () => {
    expect(totals.quotedValue).toBe(8000);
  });

  it("counts only signed vendors as contracted", () => {
    expect(totals.contractedValue).toBe(7000);
  });

  it("counts deposits actually paid exactly once", () => {
    expect(totals.depositedTotal).toBe(3000);
  });

  it("reports outstanding against signed commitments only", () => {
    expect(totals.outstanding).toBe(4000);
  });

  it("buckets the pipeline by status", () => {
    expect(totals.total).toBe(3);
    expect(totals.confirmed).toBe(2);
    expect(totals.inProgress).toBe(1);
    expect(totals.percentBooked).toBe(67);
    expect(totals.byStatus).toEqual({
      prospect: 1,
      inquiry: 0,
      quoted: 0,
      contracted: 1,
      deposit: 1,
    });
  });

  it("is safe on an empty list", () => {
    const empty = vendorProgress([]);
    expect(empty.total).toBe(0);
    expect(empty.percentBooked).toBe(0);
    expect(empty.quotedValue).toBe(0);
    expect(empty.contractedValue).toBe(0);
    expect(empty.depositedTotal).toBe(0);
    expect(empty.outstanding).toBe(0);
  });
});

describe("checklistProgress", () => {
  it("counts answered questions", () => {
    const record = vendor({
      id: "v",
      checklist: [
        { id: "a", text: "Capacity?", done: true },
        { id: "b", text: "Insurance?", done: false },
      ],
    });
    expect(checklistProgress(record)).toEqual({ total: 2, done: 1 });
  });

  it("tolerates a missing checklist from legacy data", () => {
    expect(checklistProgress({ checklist: undefined } as unknown as Vendor)).toEqual({
      total: 0,
      done: 0,
    });
  });
});

describe("normalizeVendor migration", () => {
  /** Legacy status strings from old persisted payloads. */
  const legacyStatus = (status: string): VendorStatus => status as VendorStatus;

  it("maps legacy statuses onto the current pipeline", () => {
    expect(
      normalizeVendor({ id: "v", eventId: "e", name: "A", status: legacyStatus("contacted") })
        .status,
    ).toBe("inquiry");
    expect(
      normalizeVendor({ id: "v", eventId: "e", name: "A", status: legacyStatus("booked") })
        .status,
    ).toBe("contracted");
    expect(
      normalizeVendor({ id: "v", eventId: "e", name: "A", status: legacyStatus("paid") })
        .status,
    ).toBe("deposit");
    expect(
      normalizeVendor({ id: "v", eventId: "e", name: "A", status: legacyStatus("nonsense") })
        .status,
    ).toBe("prospect");
  });

  it("converts the legacy questions array into checklist items", () => {
    const migrated = normalizeVendor({
      id: "v",
      eventId: "e",
      name: "A",
      status: "quoted",
      questions: [" What is your cancellation policy? ", "", 42],
    } as never);
    expect(migrated.checklist).toEqual([
      { id: expect.any(String), text: "What is your cancellation policy?", done: false },
    ]);
  });

  it("defaults missing money, dates and notes instead of leaving them undefined", () => {
    const migrated = normalizeVendor({ id: "v", eventId: "e", name: "A" });
    expect(migrated.quote).toBe(0);
    expect(migrated.contractValue).toBe(0);
    expect(migrated.depositAmount).toBe(0);
    expect(migrated.depositPaid).toBe(0);
    expect(migrated.inquiryDate).toBe("");
    expect(migrated.followUpDate).toBe("");
    expect(migrated.notes).toBe("");
    expect(migrated.category).toBe("Other");
    expect(migrated.checklist).toEqual([]);
  });

  it("rejects malformed dates and negative money", () => {
    const migrated = normalizeVendor({
      id: "v",
      eventId: "e",
      name: "A",
      quote: -5,
      inquiryDate: "soon",
      followUpDate: "2026-13-45",
    });
    expect(migrated.quote).toBe(0);
    expect(migrated.inquiryDate).toBe("");
    expect(migrated.followUpDate).toBe("");
  });

  it("keeps valid dates", () => {
    const migrated = normalizeVendor({
      id: "v",
      eventId: "e",
      name: "A",
      followUpDate: "2026-11-01",
    });
    expect(migrated.followUpDate).toBe("2026-11-01");
  });
});