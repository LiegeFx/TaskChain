import { NextRequest, NextResponse } from "next/server";

export interface TransactionRecord {
  id: string;
  hash: string;
  contract_name: string;
  amount: number;
  asset: string;
  status: "confirmed" | "pending" | "failed";
  date: string;
  explorer_url: string;
}

// Sample dataset of blockchain transactions
const MOCK_TRANSACTIONS: TransactionRecord[] = [
  {
    id: "tx_1",
    hash: "0xa84f3e9c1d2b7a85e6f3c4b5a6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5",
    contract_name: "EscrowContract",
    amount: 1500.0,
    asset: "USDC",
    status: "confirmed",
    date: "2026-07-26T14:30:00Z",
    explorer_url: "https://stellar.expert/explorer/testnet/tx/0xa84f3e9c1d2b7a85e6f3c4b5a6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5",
  },
  {
    id: "tx_2",
    hash: "0xb73e2d1c0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3",
    contract_name: "PaymentDistributor",
    amount: 450.5,
    asset: "USDC",
    status: "confirmed",
    date: "2026-07-25T18:15:30Z",
    explorer_url: "https://stellar.expert/explorer/testnet/tx/0xb73e2d1c0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3",
  },
  {
    id: "tx_3",
    hash: "0xc62d1c0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2",
    contract_name: "InvoiceToken",
    amount: 2500.0,
    asset: "XLM",
    status: "pending",
    date: "2026-07-25T11:45:00Z",
    explorer_url: "https://stellar.expert/explorer/testnet/tx/0xc62d1c0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2",
  },
  {
    id: "tx_4",
    hash: "0xd51c0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1",
    contract_name: "EscrowContract",
    amount: 800.0,
    asset: "USDC",
    status: "confirmed",
    date: "2026-07-24T09:20:10Z",
    explorer_url: "https://stellar.expert/explorer/testnet/tx/0xd51c0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1",
  },
  {
    id: "tx_5",
    hash: "0xe40b9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0",
    contract_name: "StellarSettle",
    amount: 320.0,
    asset: "USDC",
    status: "failed",
    date: "2026-07-23T16:05:44Z",
    explorer_url: "https://stellar.expert/explorer/testnet/tx/0xe40b9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0",
  },
  {
    id: "tx_6",
    hash: "0xf39a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9",
    contract_name: "PaymentDistributor",
    amount: 1200.0,
    asset: "USDC",
    status: "confirmed",
    date: "2026-07-22T20:10:00Z",
    explorer_url: "https://stellar.expert/explorer/testnet/tx/0xf39a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9",
  },
  {
    id: "tx_7",
    hash: "0xa28b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8",
    contract_name: "EscrowContract",
    amount: 3500.0,
    asset: "USDC",
    status: "confirmed",
    date: "2026-07-21T13:40:12Z",
    explorer_url: "https://stellar.expert/explorer/testnet/tx/0xa28b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8",
  },
  {
    id: "tx_8",
    hash: "0xb17c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7",
    contract_name: "InvoiceToken",
    amount: 600.0,
    asset: "XLM",
    status: "confirmed",
    date: "2026-07-20T10:15:00Z",
    explorer_url: "https://stellar.expert/explorer/testnet/tx/0xb17c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7",
  },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const status = searchParams.get("status")?.toLowerCase() || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10", 10));

    // Filter transactions
    let filtered = MOCK_TRANSACTIONS.filter((tx) => {
      const matchesSearch =
        !search ||
        tx.hash.toLowerCase().includes(search) ||
        tx.contract_name.toLowerCase().includes(search);
      const matchesStatus = status === "all" || tx.status === status;
      return matchesSearch && matchesStatus;
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    // Compute stats
    const totalVolume = MOCK_TRANSACTIONS.reduce(
      (sum, tx) => (tx.status === "confirmed" ? sum + tx.amount : sum),
      0
    );
    const confirmedCount = MOCK_TRANSACTIONS.filter(
      (tx) => tx.status === "confirmed"
    ).length;
    const pendingCount = MOCK_TRANSACTIONS.filter(
      (tx) => tx.status === "pending"
    ).length;
    const failedCount = MOCK_TRANSACTIONS.filter(
      (tx) => tx.status === "failed"
    ).length;

    return NextResponse.json({
      transactions: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats: {
        totalTransactions: MOCK_TRANSACTIONS.length,
        totalVolume,
        confirmedCount,
        pendingCount,
        failedCount,
      },
    });
  } catch (error) {
    console.error("[GET /api/transactions] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
