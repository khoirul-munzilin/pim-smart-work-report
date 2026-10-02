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
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

function getYesterdayJakarta() {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const year = Number(dateParts.find((part) => part.type === "year").value);
  const month = Number(dateParts.find((part) => part.type === "month").value);
  const day = Number(dateParts.find((part) => part.type === "day").value);

  const yesterdayUtc = new Date(Date.UTC(year, month - 1, day - 1));

  return [
    yesterdayUtc.getUTCFullYear(),
    String(yesterdayUtc.getUTCMonth() + 1).padStart(2, "0"),
    String(yesterdayUtc.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function getJakartaDateRange(date) {
  const startDate = new Date(`${date}T00:00:00+07:00`);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString()
  };
}

function formatJakartaDate(value) {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

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
    color: { argb: "FFFFFFFF" }
  };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF124E78" }
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

  if (error) throw error;

  const arrayBuffer = await data.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    extension: data.type && data.type.includes("png") ? "png" : "jpeg"
  };
}

const reportDate = getYesterdayJakarta();
const dateRange = getJakartaDateRange(reportDate);

const { data: reportData, error: reportError } = await sb
  .from("reports_export_view")
  .select("*")
  .gte("created_at", dateRange.start)
  .lt("created_at", dateRange.end)
  .order("created_at", { ascending: true });

if (reportError) throw reportError;

const rows = reportData || [];
const closedCount = rows.filter((item) => item.status === "CLOSED").length;
const notClosedCount = rows.length - closedCount;

const workbook = new ExcelJS.Workbook();
workbook.creator = "PIM Smart Work Report";
workbook.created = new Date();

const summarySheet = workbook.addWorksheet("Ringkasan");
summarySheet.addRows([
  ["DAILY ENGINEERING REPORT", reportDate],
  ["Total Maintenance Request", rows.length],
  ["Closed", closedCount],
  ["Belum Closed", notClosedCount]
]);
summarySheet.getRow(1).font = {
  bold: true,
  size: 16,
  color: { argb: "FFFFFFFF" }
};
summarySheet.getRow(1).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF124E78" }
};
summarySheet.getColumn(1).width = 32;
summarySheet.getColumn(2).width = 22;

const detailSheet = workbook.addWorksheet("Detail Pekerjaan");
detailSheet.views = [{ state: "frozen", ySplit: 1 }];
detailSheet.columns = [
  { header: "No.", key: "number", width: 7 },
  { header: "Report", key: "report_no", width: 24 },
  { header: "Tanggal Request", key: "created_at", width: 22 },
  { header: "Jenis Pekerjaan", key: "request_type", width: 20 },
  { header: "Kode Mesin", key: "machine_code", width: 22 },
  { header: "Nama Mesin", key: "machine_name", width: 28 },
  { header: "Machine Group", key: "machine_group", width: 18 },
  { header: "Section", key: "section", width: 24 },
  { header: "Functional Location", key: "functional_location", width: 46 },
  { header: "Equipment Number", key: "sap_equipment", width: 26 },
  { header: "Shift", key: "shift", width: 15 },
  { header: "Prioritas", key: "priority", width: 15 },
  { header: "Temuan / Permintaan", key: "problem", width: 45 },
  { header: "Dampak Operasional", key: "impact", width: 40 },
  { header: "Status", key: "status", width: 20 },
  { header: "Operator", key: "reporter_name", width: 24 },
  { header: "Teknisi", key: "technician_name", width: 24 },
  { header: "Penyebab", key: "cause", width: 40 },
  { header: "Tindakan", key: "action", width: 45 },
  { header: "Spare Part", key: "spare_part", width: 30 },
  { header: "Catatan Teknisi", key: "tech_note", width: 40 },
  { header: "Hasil Test", key: "production_test", width: 18 },
  { header: "Catatan Verifikasi", key: "production_note", width: 40 },
  { header: "SAP Notification", key: "sap_notification", width: 22 },
  { header: "Waktu Mulai", key: "start_at", width: 22 },
  { header: "Request Verification", key: "request_check_at", width: 22 },
  { header: "Waktu Verifikasi", key: "verified_at", width: 22 },
  { header: "Waktu Closed", key: "closed_at", width: 22 }
];

rows.forEach((report, index) => {
  detailSheet.addRow({
    number: index + 1,
    report_no: report.report_no || "",
    created_at: formatJakartaDate(report.created_at),
    request_type: report.request_type || "",
    machine_code: report.machine_code || "",
    machine_name: report.machine_name || "",
    machine_group: report.machine_group || "",
    section: report.section || "",
    functional_location: report.functional_location || "",
    sap_equipment: report.sap_equipment || "",
    shift: report.shift || "",
    priority: report.priority || "",
    problem: report.problem || "",
    impact: report.impact || "",
    status: report.status || "",
    reporter_name: report.reporter_name || "",
    technician_name: report.technician_name || "",
    cause: report.cause || "",
    action: report.action || "",
    spare_part: report.spare_part || "",
    tech_note: report.tech_note || "",
    production_test: report.production_test || "",
    production_note: report.production_note || "",
    sap_notification: report.sap_notification || "",
    start_at: formatJakartaDate(report.start_at),
    request_check_at: formatJakartaDate(report.request_check_at),
    verified_at: formatJakartaDate(report.verified_at),
    closed_at: formatJakartaDate(report.closed_at)
  });
});

styleHeader(detailSheet.getRow(1));
detailSheet.autoFilter = { from: "A1", to: "AB1" };
detailSheet.eachRow((row, rowNumber) => {
  if (rowNumber > 1) {
    row.alignment = {
      vertical: "top",
      wrapText: true
    };

    if (rowNumber % 2 === 0) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F7FA" }
      };
    }
  }
});

const photoSheet = workbook.addWorksheet("Dokumentasi Foto");
photoSheet.getColumn("A").width = 34;
photoSheet.getColumn("B").width = 4;
photoSheet.getColumn("C").width = 34;
photoSheet.getColumn("D").width = 4;
photoSheet.getColumn("E").width = 34;

const stageColumns = {
  PROBLEM: 1,
  AFTER_REPAIR: 3,
  VERIFICATION: 5
};

let photoRow = 1;

for (const report of rows) {
  photoSheet.mergeCells(photoRow, 1, photoRow, 5);

  const titleCell = photoSheet.getCell(photoRow, 1);
  titleCell.value = `${report.report_no} • ${report.machine_name || "-"} • ${report.status || "-"}`;
  titleCell.font = {
    bold: true,
    size: 13,
    color: { argb: "FFFFFFFF" }
  };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF124E78" }
  };
  titleCell.alignment = { vertical: "middle" };
  photoSheet.getRow(photoRow).height = 26;

  photoSheet.getCell(photoRow + 1, 1).value = "Kondisi Awal";
  photoSheet.getCell(photoRow + 1, 3).value = "Hasil Pekerjaan";
  photoSheet.getCell(photoRow + 1, 5).value = "Verifikasi";

  [1, 3, 5].forEach((column) => {
    const cell = photoSheet.getCell(photoRow + 1, column);
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
  });

  const { data: photos, error: photoQueryError } = await sb
    .from("photos")
    .select("stage, path")
    .eq("report_id", report.id);

  if (photoQueryError) {
    console.error(`Foto gagal dibaca untuk ${report.report_no}:`, photoQueryError);
  }

  for (const photo of photos || []) {
    const targetColumn = stageColumns[photo.stage];
    if (!targetColumn || !photo.path) continue;

    try {
      const imageData = await downloadPhoto(photo.path);
      const imageId = workbook.addImage(imageData);

      photoSheet.addImage(imageId, {
        tl: {
          col: targetColumn - 1,
          row: photoRow + 1
        },
        ext: {
          width: 240,
          height: 180
        }
      });
    } catch (photoError) {
      console.error(`Dokumentasi ${report.report_no} gagal dimuat:`, photoError);
      photoSheet.getCell(photoRow + 3, targetColumn).value = "Dokumentasi tidak dapat dimuat";
    }
  }

  for (
    let rowIndex = photoRow + 2;
    rowIndex <= photoRow + 11;
    rowIndex += 1
  ) {
    photoSheet.getRow(rowIndex).height = 18;
  }

  photoRow += 13;
}

const excelBuffer = await workbook.xlsx.writeBuffer();
const attachment = Buffer.from(excelBuffer);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

await transporter.verify();

await transporter.sendMail({
  from: `PIM Daily Report <${process.env.GMAIL_USER}>`,
  to: process.env.REPORT_TO,
  subject: `Daily Engineering Report - ${reportDate}`,
  html: `
    <h2>Daily Engineering Report</h2>
    <p>Tanggal data: <b>${reportDate}</b></p>
    <p>
      Total: <b>${rows.length}</b> |
      Closed: <b>${closedCount}</b> |
      Belum Closed: <b>${notClosedCount}</b>
    </p>
    <p>
      Lampiran memuat detail Maintenance Request, Functional Location,
      Equipment Number, dan dokumentasi pekerjaan.
    </p>
  `,
  attachments: [
    {
      filename: `Daily_Engineering_Report_${reportDate}.xlsx`,
      content: attachment,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
  ]
});

console.log("Daily report sent", {
  reportDate,
  total: rows.length,
  closed: closedCount,
  notClosed: notClosedCount
});
