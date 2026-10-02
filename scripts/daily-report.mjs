import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import nodemailer from "nodemailer";

const requiredSecrets = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "REPORT_TO"
];

for (const secretName of requiredSecrets) {
  if (!process.env[secretName]) {
    throw new Error(`Secret belum ada: ${secretName}`);
  }
}

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/*
 * Menentukan tanggal kemarin berdasarkan waktu Jakarta.
 * Workflow tetap berjalan sekitar pukul 07.07 WIB.
 */
function getYesterdayJakarta() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(yesterday);
}

function getDateRange(date) {
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(parsed);
}

function styleHeader(row) {
  row.height = 32;

  row.font = {
    bold: true,
    color: {
      argb: "FFFFFFFF"
    }
  };

  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: "FF17365D"
    }
  };

  row.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true
  };
}

async function downloadPhoto(path) {
  const { data, error } = await sb.storage
    .from("work-photos")
    .download(path);

  if (error) {
    throw error;
  }

  const arrayBuffer = await data.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    extension: data.type?.includes("png")
      ? "png"
      : "jpeg"
  };
}

const reportDate = getYesterdayJakarta();
const dateRange = getDateRange(reportDate);

/*
 * Menggunakan reports_export_view agar Excel memperoleh:
 * machine_group
 * functional_location
 * sap_equipment
 * request_type
 */
const { data: rows, error: reportError } = await sb
  .from("reports_export_view")
  .select("*")
  .gte("created_at", dateRange.start)
  .lt("created_at", dateRange.end)
  .order("created_at", {
    ascending: true
  });

if (reportError) {
  throw reportError;
}

const reports = rows || [];
const closedCount = reports.filter(
  (report) => report.status === "CLOSED"
).length;

const openCount = reports.filter(
  (report) => report.status !== "CLOSED"
).length;

/*
 * MEMBUAT WORKBOOK
 */
const workbook = new ExcelJS.Workbook();

workbook.creator = "PIM Smart Work Report";
workbook.created = new Date();

/*
 * SHEET RINGKASAN
 */
const summarySheet = workbook.addWorksheet("Ringkasan");

summarySheet.addRows([
  ["DAILY ENGINEERING REPORT", reportDate],
  ["Total Maintenance Request", reports.length],
  ["Closed", closedCount],
  ["Belum Closed", openCount]
]);

summarySheet.getRow(1).font = {
  bold: true,
  size: 16,
  color: {
    argb: "FFFFFFFF"
  }
};

summarySheet.getRow(1).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: {
    argb: "FF17365D"
  }
};

summarySheet.getColumn(1).width = 32;
summarySheet.getColumn(2).width = 22;

/*
 * SHEET DETAIL PEKERJAAN
 */
const detailSheet = workbook.addWorksheet(
  "Detail Pekerjaan"
);

detailSheet.views = [
  {
    state: "frozen",
    ySplit: 1
  }
];

detailSheet.columns = [
  {
    header: "No.",
    key: "number",
    width: 7
  },
  {
    header: "Nomor Request",
    key: "report_no",
    width: 24
  },
  {
    header: "Tanggal Request",
    key: "created_at",
    width: 22
  },
  {
    header: "Jenis Pekerjaan",
    key: "request_type",
    width: 20
  },
  {
    header: "Kode Mesin",
    key: "machine_code",
    width: 22
  },
  {
    header: "Nama Mesin",
    key: "machine_name",
    width: 28
  },
  {
    header: "Machine Group",
    key: "machine_group",
    width: 18
  },
  {
    header: "Section",
    key: "section",
    width: 24
  },
  {
    header: "Functional Location",
    key: "functional_location",
    width: 46
  },
  {
    header: "Equipment Number",
    key: "sap_equipment",
    width: 26
  },
  {
    header: "Shift",
    key: "shift",
    width: 15
  },
  {
    header: "Prioritas",
    key: "priority",
    width: 15
  },
  {
    header: "Deskripsi Kerusakan / Permintaan",
    key: "problem",
    width: 45
  },
  {
    header: "Dampak Operasional",
    key: "impact",
    width: 40
  },
  {
    header: "Status",
    key: "status",
    width: 20
  },
  {
    header: "Pelapor",
    key: "reporter_name",
    width: 24
  },
  {
    header: "Technician",
    key: "technician_name",
    width: 24
  },
  {
    header: "Penyebab",
    key: "cause",
    width: 40
  },
  {
    header: "Tindakan",
    key: "action",
    width: 45
  },
  {
    header: "Spare Part",
    key: "spare_part",
    width: 30
  },
  {
    header: "Catatan Technician",
    key: "tech_note",
    width: 40
  },
  {
    header: "Hasil Test",
    key: "production_test",
    width: 18
  },
  {
    header: "Catatan Verifikasi",
    key: "production_note",
    width: 40
  },
  {
    header: "SAP Notification",
    key: "sap_notification",
    width: 22
  },
  {
    header: "Waktu Mulai",
    key: "start_at",
    width: 22
  },
  {
    header: "Request Verification",
    key: "request_check_at",
    width: 22
  },
  {
    header: "Waktu Verifikasi",
    key: "verified_at",
    width: 22
  },
  {
    header: "Waktu Closed",
    key: "closed_at",
    width: 22
  }
];

reports.forEach((report, index) => {
  detailSheet.addRow({
    number: index + 1,
    report_no: report.report_no || "",
    created_at: formatDate(report.created_at),
    request_type: report.request_type || "",
    machine_code: report.machine_code || "",
    machine_name: report.machine_name || "",
    machine_
