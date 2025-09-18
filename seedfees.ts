import { FieldValue } from "firebase-admin/firestore";
import { db } from "./src/config/firebase.config";

// --- Configuration ---
const STUDENT_ID = "41npEMRasvU640Ic3ts7G7YijUJ3"; // The ID of the student you want to seed data for

// --- Seed Data for 6 Semesters ---
// This is an array of objects, where each object is a semester's fee data.
const semestersData = [
  {
    semester: 1,
    status: "paid",
    dueDate: "2025-11-30T11:33:04Z",
    feeBreakdown: {
      tuitionFee: 175000,
      hostelFee: 28000,
      registrationFee: 1000,
      laundryFee: 0,
      examFee: 1000,
      messFee: 25000,
    },
    totalAmount: 230000,
    amountPaid: 230000,
    dueAmount: 0,
    paymentHistory: [
      {
        transactionId: "a7f3c2d8-4b5e-4c9a-8e6f-2d3c4b5a6e7f",
        amount: 230000,
        date: "2025-11-25T11:33:04Z",
        method: "online_gateway",
        notes: "Full payment",
      },
    ],
  },
  {
    semester: 2,
    status: "paid",
    dueDate: "2026-02-28T11:33:04Z",
    feeBreakdown: {
      tuitionFee: 175000,
      hostelFee: 28000,
      registrationFee: 1000,
      laundryFee: 500,
      examFee: 1000,
      messFee: 25000,
    },
    totalAmount: 230500,
    amountPaid: 230500,
    dueAmount: 0,
    paymentHistory: [
      {
        transactionId: "b8e4d3f9-5c6f-4d0b-9f7g-3e4d5c6b7f8g",
        amount: 230500,
        date: "2026-01-15T10:00:00Z",
        method: "bank_transfer",
        notes: "Full payment",
      },
    ],
  },
  {
    semester: 3,
    status: "paid",
    dueDate: "2026-05-29T11:33:04Z",
    feeBreakdown: {
      tuitionFee: 175000,
      hostelFee: 28000,
      registrationFee: 1000,
      laundryFee: 0,
      examFee: 1000,
      messFee: 25000,
    },
    totalAmount: 230000,
    amountPaid: 230000,
    dueAmount: 0,
    paymentHistory: [
      {
        transactionId: "c9f5e4a0-6d7g-5e1c-0g8h-4f5e6d7c8g9h",
        amount: 230000,
        date: "2026-05-20T10:00:00Z",
        method: "online_gateway",
        notes: "Full payment",
      },
    ],
  },
  {
    semester: 4,
    status: "paid",
    dueDate: "2026-08-27T11:33:04Z",
    feeBreakdown: {
      tuitionFee: 175000,
      hostelFee: 28000,
      registrationFee: 1000,
      laundryFee: 500,
      examFee: 1000,
      messFee: 25000,
    },
    totalAmount: 230500,
    amountPaid: 230500,
    dueAmount: 0,
    paymentHistory: [
      {
        transactionId: "d0g6f5b1-7e8h-6f2d-1h9i-5g6f7e8d9h0i",
        amount: 230500,
        date: "2026-08-20T10:00:00Z",
        method: "bank_transfer",
        notes: "Full payment",
      },
    ],
  },
  {
    semester: 5,
    status: "paid",
    dueDate: "2026-11-25T11:33:04Z",
    feeBreakdown: {
      tuitionFee: 175000,
      hostelFee: 28000,
      registrationFee: 1000,
      laundryFee: 0,
      examFee: 1000,
      messFee: 25000,
    },
    totalAmount: 230000,
    amountPaid: 230000,
    dueAmount: 0,
    paymentHistory: [
      {
        transactionId: "e1h7g6c2-8f9i-7g3e-2i0j-6h7g8f9e0i1j",
        amount: 230000,
        date: "2026-11-18T10:00:00Z",
        method: "online_gateway",
        notes: "Full payment",
      },
    ],
  },
  {
    semester: 6,
    status: "paid",
    dueDate: "2027-02-23T11:33:04Z",
    feeBreakdown: {
      tuitionFee: 175000,
      hostelFee: 28000,
      registrationFee: 1000,
      laundryFee: 500,
      examFee: 1000,
      messFee: 25000,
    },
    totalAmount: 230500,
    amountPaid: 230500,
    dueAmount: 0,
    paymentHistory: [
      {
        transactionId: "f2i8h7d3-9g0j-8h4f-3j1k-7i8h9g0f1j2k",
        amount: 230500,
        date: "2027-02-16T10:00:00Z",
        method: "bank_transfer",
        notes: "Full payment",
      },
    ],
  },
  {
    semester: 7,
    status: "unpaid",
    dueDate: "2027-05-25T11:33:04Z",
    feeBreakdown: {
      tuitionFee: 175000,
      hostelFee: 28000,
      registrationFee: 1000,
      laundryFee: 0,
      examFee: 1000,
      messFee: 25000,
    },
    totalAmount: 230000,
    amountPaid: 0,
    dueAmount: 230000,
    paymentHistory: [],
  },
];

// --- The Seeding Function ---
async function seedFeesData(studentId: string) {
  console.log(`Starting to seed fee data for student: ${studentId}`);

  // Get a new write batch
  const batch = db.batch();

  // 1. Create the main parent document in the 'fees' collection
  const feesDocRef = db.collection("fees").doc(studentId);
  batch.set(feesDocRef, {
    studentId: studentId,
    lastActivityDate: FieldValue.serverTimestamp(),
    overallDueAmount: 230000,
  });

  // 2. Loop through the semester data and add each to the subcollection
  semestersData.forEach((semesterData) => {
    // The document ID for each semester is its number (e.g., '1', '2', '3')
    const semesterDocRef = feesDocRef
      .collection("semesters")
      .doc(semesterData.semester.toString());
    batch.set(semesterDocRef, semesterData);
  });

  // 3. Commit the batch
  await batch.commit();
  console.log(
    `Successfully seeded ${semestersData.length} semesters for student ${studentId}.`
  );

  // 4. (Optional but recommended) Update the overallDueAmount
  await updateOverallDue(studentId);
}

// --- Helper Function to Update Overall Due Amount ---
async function updateOverallDue(studentId: string) {
  const semestersRef = db
    .collection("fees")
    .doc(studentId)
    .collection("semesters");
  const snapshot = await semestersRef.get();

  let totalDue = 0;
  snapshot.forEach((doc) => {
    totalDue += doc.data().dueAmount;
  });

  await db.collection("fees").doc(studentId).update({
    overallDueAmount: totalDue,
  });

  console.log(`Updated overall due amount for ${studentId} to: ${totalDue}`);
}

// --- Run the Seeder ---
seedFeesData(STUDENT_ID).catch((error) => {
  console.error("Error seeding data:", error);
});
