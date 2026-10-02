const cfg = window.APP_CONFIG;

if (!cfg || cfg.SUPABASE_URL.includes("PROJECT")) {
  alert("Isi public/config.js terlebih dahulu.");
}

const sb = supabase.createClient(
  cfg.SUPABASE_URL,
  cfg.SUPABASE_ANON_KEY
);

let current = null;
let profile = null;
let reports = [];
let machines = [];
let technicians = [];
let active = null;

const $ = (id) => document.getElementById(id);

const toast = (message) => {
  const element = $("toast");
  element.textContent = message;
  element.classList.remove("hidden");
  setTimeout(() => element.classList.add("hidden"), 3000);
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  const {
    data: { session }
  } = await sb.auth.getSession();

  if (session) {
    await enter(session.user);
  }
}

$("loginForm").onsubmit = async (event) => {
  event.preventDefault();

  const { data, error } = await sb.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value
  });

  if (error) {
    return toast(error.message);
  }

  await enter(data.user);
};

async function enter(user) {
  current = user;

  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    return toast("Profile belum dibuat oleh Admin");
  }

  profile = data;

  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("who").textContent = `${profile.full_name} • ${profile.role}`;

  document.querySelectorAll("nav button[class]").forEach((button) => {
    const allowed =
      button.classList.contains(profile.role) || profile.role === "admin";

    button.classList.toggle("hidden", !allowed);
  });

  await load();
  show("dashboard");
}

$("logout").onclick = async () => {
  await sb.auth.signOut();
  location.reload();
};

document.querySelectorAll("[data-page]").forEach((button) => {
  button.onclick = async () => {
    if (button.dataset.page === "create") {
      await loadTechnicians();
    }

    show(button.dataset.page);
  };
});

function show(id) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.add("hidden");
  });

  $(id).classList.remove("hidden");
  render();
}

async function loadTechnicians() {
  const select = $("technicianSelect");

  if (!select) {
    return;
  }

  select.innerHTML = '<option value="">Memuat technician...</option>';

  const { data, error } = await sb
    .from("profiles")
    .select("id, full_name, section")
    .eq("role", "technician")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("Gagal memuat technician:", error);
    select.innerHTML = '<option value="">Gagal memuat technician</option>';
    toast(`Gagal memuat technician: ${error.message}`);
    return;
  }

  technicians = data || [];

  select.innerHTML = '<option value="">Pilih technician</option>';

  technicians.forEach((technician) => {
    const option = document.createElement("option");
    option.value = technician.id;
    option.textContent = technician.section
      ? `${technician.full_name} • ${technician.section}`
      : technician.full_name;
    select.appendChild(option);
  });

  if (technicians.length === 0) {
    select.innerHTML =
      '<option value="">Belum ada profile role technician</option>';
  }
}

async function load() {
  let machineQuery = sb
    .from("machines")
    .select("*")
    .eq("active", true)
    .order("machine_group", { ascending: true })
    .order("section", { ascending: true })
    .order("name", { ascending: true });

  if (profile.role === "operator") {
    const operatorGroup = String(
      profile.section || ""
    )
      .trim()
      .toUpperCase();

    if (
      !["RDS", "HMP", "GENERAL"].includes(operatorGroup)
    ) {
      toast(
        "Section Operator harus RDS, HMP, atau GENERAL."
      );
    } else {
      machineQuery = machineQuery.eq(
        "machine_group",
        operatorGroup
      );
    }
  }

  const machineResult = await machineQuery;

  let reportQuery = sb
    .from("reports_view")
    .select("*")
    .order("created_at", {
      ascending: false
    });

  if (profile.role === "technician") {
    reportQuery = reportQuery.eq(
      "technician_id",
      current.id
    );
  } else if (profile.role === "operator") {
    reportQuery = reportQuery.eq(
      "reporter_id",
      current.id
    );
  }

  const reportResult = await reportQuery;

  if (machineResult.error || reportResult.error) {
    const error =
      machineResult.error || reportResult.error;

    console.error("Gagal memuat data:", error);
    return toast(error.message);
  }

  machines = machineResult.data || [];
  reports = reportResult.data || [];
const machineSelect = document.getElementById("machineSelect");

if (machineSelect) {
  machineSelect.innerHTML =
    '<option value="">Pilih mesin</option>';

  machines.forEach((machine) => {
    const option = document.createElement("option");

    option.value = machine.id;

    const group =
      machine.machine_group ||
      machine.group_name ||
      "GENERAL";

    const code =
      machine.code ||
      machine.machine_code ||
      "";

    const name =
      machine.name ||
      machine.machine_name ||
      "";

    option.textContent =
      `[${group}] ${code} • ${name}`;

    machineSelect.appendChild(option);
  });

  if (machines.length === 0) {
    machineSelect.innerHTML =
      '<option value="">Tidak ada mesin untuk section ini</option>';
  }
}
  const machineGroupDisplay =
    document.getElementById("machineGroupDisplay");

  if (machineGroupDisplay) {
    machineGroupDisplay.value =
      profile.role === "operator"
        ? String(profile.section || "")
            .trim()
            .toUpperCase()
        : "SEMUA KELOMPOK";
  }

  if (
    profile.role === "operator" ||
    profile.role === "admin"
  ) {
    await loadTechnicians();
  }

  render();
}

function render() {
  const openCount = reports.filter((item) => item.status === "OPEN").length;
  const closedCount = reports.filter(
    (item) => item.status === "CLOSED"
  ).length;

  $("total").textContent = reports.length;
  $("open").textContent = openCount;
  $("closed").textContent = closedCount;
  $("progress").textContent = reports.length - openCount - closedCount;

  $("latest").innerHTML =
    reports.slice(0, 10).map(card).join("") || "Belum ada data";

  const technicianJobs = reports.filter(
    (item) =>
      item.technician_id === current.id &&
      ["OPEN", "IN_PROGRESS", "RETURNED"].includes(item.status)
  );

  $("jobList").innerHTML =
    technicianJobs
      .map(
        (item) => `
          <article class="card job">
            <span class="badge">${escapeHtml(item.status)}</span>
            <h3>${escapeHtml(item.report_no)} • ${escapeHtml(
          item.machine_name
        )}</h3>
            <p>${escapeHtml(item.problem)}</p>
            <button onclick="startWork('${escapeHtml(
              item.id
            )}')">MULAI / LANJUTKAN</button>
          </article>
        `
      )
      .join("") || '<div class="card">Tidak ada pekerjaan.</div>';

  $("verifyList").innerHTML =
    reports
      .filter((item) => item.status === "REQUEST_CHECK")
      .map(
        (item) => `
          <article class="card job">
            <span class="badge">REQUEST CHECK</span>
            <h3>${escapeHtml(item.report_no)} • ${escapeHtml(
          item.machine_name
        )}</h3>
            <p>${escapeHtml(item.action || "")}</p>
            <button onclick="startVerify('${escapeHtml(
              item.id
            )}')">CEK HASIL</button>
          </article>
        `
      )
      .join("") ||
    '<div class="card">Belum ada Request Check.</div>';

  $("reportRows").innerHTML = reports
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.report_no)}</td>
          <td>${escapeHtml(item.machine_name)}</td>
          <td>${escapeHtml(item.problem)}</td>
          <td>${escapeHtml(item.status)}</td>
          <td>${escapeHtml(item.technician_name || "-")}</td>
        </tr>
      `
    )
    .join("");
}

function card(item) {
  return `
    <p>
      <span class="badge">${escapeHtml(item.status)}</span>
      <b>${escapeHtml(item.report_no)} • ${escapeHtml(
    item.machine_name
  )}</b><br>
      ${escapeHtml(item.problem)}
    </p>
  `;
}

async function upload(file, reportId, stage) {
  if (!file || !file.name) {
    return null;
  }

  const extension = file.name.split(".").pop();
  const path = `${reportId}/${stage}-${Date.now()}.${extension}`;

  const { error } = await sb.storage
    .from("work-photos")
    .upload(path, file, { contentType: file.type });

  if (error) {
    throw error;
  }

  const { error: photoError } = await sb.from("photos").insert({
    report_id: reportId,
    stage,
    path
  });

  if (photoError) {
    throw photoError;
  }

  return path;
}

$("createForm").onsubmit = async (event) => {
event.preventDefault();
 
try {
const formData = new FormData(event.target);
const technicianId = formData.get("technician_id");
 
if (!technicianId) {
throw new Error("Pilih technician terlebih dahulu.");
}
 
// Ambil machine_id dari form jika sudah tersedia
let machineId = formData.get("machine_id");
 
// Jika machine_id kosong, cari berdasarkan teks pada kolom Cari Mesin
if (!machineId) {
const inputs = Array.from(
event.target.querySelectorAll("input")
);
 
const searchInput = inputs.find((input) => {
const text = `${input.id} ${input.name} ${input.placeholder}`
.toLowerCase();
 
return (
text.includes("machine") ||
text.includes("mesin") ||
String(input.value).includes("[")
);
});
 
const keyword = String(searchInput?.value || "")
.trim()
.toUpperCase();
 
const selectedMachine = machines.find((machine) => {
const code = String(machine.code || "")
.trim()
.toUpperCase();
 
const name = String(machine.name || "")
.trim()
.toUpperCase();
 
return (
keyword === code ||
keyword === name ||
keyword.includes(code) ||
keyword.includes(name)
);
});
 
if (selectedMachine) {
machineId = selectedMachine.id;
}
}
 
if (!machineId) {
throw new Error(
"Mesin tidak ditemukan. Hapus pencarian, lalu pilih mesin kembali."
);
}
 
const reportNumber =
"RPT-" +
new Date()
.toISOString()
.slice(0, 10)
.replaceAll("-", "") +
"-" +
String(Date.now()).slice(-5);
 
const { data, error } = await sb
.from("reports")
.insert({
report_no: reportNumber,
machine_id: machineId,
reporter_id: current.id,
technician_id: technicianId,
shift: formData.get("shift"),
priority: formData.get("priority"),
problem: formData.get("problem"),
impact: formData.get("impact"),
status: "OPEN"
})
.select()
.single();
 
if (error) {
throw error;
}
 
const photo = formData.get("photo");
 
if (photo && photo.size > 0) {
await upload(photo, data.id, "PROBLEM");
}
 
event.target.reset();
 
await load();
show("dashboard");
 
toast("Laporan berhasil dikirim ke technician");
} catch (error) {
console.error("Gagal membuat laporan:", error);
toast(error.message);
}
};

window.startWork = async (id) => {
  active = reports.find((item) => item.id === id);

  if (!active) {
    return toast("Pekerjaan tidak ditemukan.");
  }

  if (active.technician_id !== current.id && profile.role !== "admin") {
    return toast("Pekerjaan ini ditugaskan kepada technician lain.");
  }

  if (active.status !== "IN_PROGRESS") {
    const { error } = await sb
      .from("reports")
      .update({
        status: "IN_PROGRESS",
        start_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("technician_id", current.id);

    if (error) {
      return toast(error.message);
    }

    active.status = "IN_PROGRESS";
  }

  $("workTitle").innerHTML = `
    <b>${escapeHtml(active.report_no)} • ${escapeHtml(
    active.machine_name
  )}</b>
    <p>${escapeHtml(active.problem)}</p>
  `;

  show("work");
};

$("workForm").onsubmit = async (event) => {
  event.preventDefault();

  try {
    const formData = new FormData(event.target);

    const { error } = await sb
      .from("reports")
      .update({
        cause: formData.get("cause"),
        action: formData.get("action"),
        spare_part: formData.get("spare_part"),
        tech_note: formData.get("tech_note"),
        status: "REQUEST_CHECK",
        request_check_at: new Date().toISOString()
      })
      .eq("id", active.id)
      .eq("technician_id", current.id);

    if (error) {
      throw error;
    }

    await upload(formData.get("photo"), active.id, "AFTER_REPAIR");

    event.target.reset();
    await load();
    show("jobs");
    toast("Request Check dikirim");
  } catch (error) {
    console.error("Gagal mengirim Request Check:", error);
    toast(error.message);
  }
};

window.startVerify = (id) => {
  active = reports.find((item) => item.id === id);

  if (!active) {
    return toast("Laporan tidak ditemukan.");
  }

  $("verifyTitle").innerHTML = `
    <b>${escapeHtml(active.report_no)} • ${escapeHtml(
    active.machine_name
  )}</b>
    <p>${escapeHtml(active.action || "")}</p>
  `;

  show("verifyFormPage");
};

$("verifyForm").onsubmit = async (event) => {
  event.preventDefault();

  try {
    const formData = new FormData(event.target);
    const decision = event.submitter.value;

    if (
      decision === "CLOSED" &&
      formData.get("production_test") !== "NORMAL"
    ) {
      throw new Error("Hasil harus NORMAL untuk Closed");
    }

    const { error } = await sb
      .from("reports")
      .update({
        production_test: formData.get("production_test"),
        production_note: formData.get("production_note"),
        status: decision,
        verifier_id: current.id,
        verified_at: new Date().toISOString(),
        closed_at:
          decision === "CLOSED" ? new Date().toISOString() : null
      })
      .eq("id", active.id);

    if (error) {
      throw error;
    }

    await upload(formData.get("photo"), active.id, "VERIFICATION");

    event.target.reset();
    await load();
    show("dashboard");
    toast(decision === "CLOSED" ? "Report Closed" : "Dikembalikan");
  } catch (error) {
    console.error("Gagal memverifikasi laporan:", error);
    toast(error.message);
  }
};

$("machineForm").onsubmit = async (event) => {
  event.preventDefault();

  const formData = new FormData(event.target);
  const { error } = await sb.from("machines").insert({
    code: formData.get("code").toUpperCase(),
    name: formData.get("name"),
    section: formData.get("section")
  });

  if (error) {
    return toast(error.message);
  }

  event.target.reset();
  await load();
  toast("Mesin disimpan");
};

$("downloadExcel").onclick = async () => {
  try {
    const date = $("reportDate").value;

    if (!date) {
      throw new Error("Pilih tanggal report terlebih dahulu.");
    }

    const nextDate = new Date(`${date}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + 1);

    const rows = reports.filter(
      (report) =>
        report.created_at >= `${date}T00:00:00` &&
        report.created_at <
          `${nextDate.toISOString().slice(0, 10)}T00:00:00`
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Detail");

    worksheet.columns = [
      "Report",
      "Mesin",
      "Section",
      "Temuan",
      "Dampak",
      "Prioritas",
      "Status",
      "Operator",
      "Teknisi",
      "Penyebab",
      "Tindakan",
      "Spare Part"
    ].map((header, index) => ({
      header,
      key: String(index),
      width: index < 3 ? 18 : 28
    }));

    rows.forEach((report) => {
      worksheet.addRow([
        report.report_no,
        report.machine_name,
        report.section,
        report.problem,
        report.impact,
        report.priority,
        report.status,
        report.reporter_name,
        report.technician_name,
        report.cause,
        report.action,
        report.spare_part
      ]);
    });

    const photoSheet = workbook.addWorksheet("Dokumentasi");
    let row = 1;

    for (const report of rows) {
      photoSheet.getCell(row, 1).value =
        `${report.report_no} • ${report.machine_name}`;
      photoSheet.getCell(row, 1).font = { bold: true };

      const { data: photos, error: photoError } = await sb
        .from("photos")
        .select("*")
        .eq("report_id", report.id);

      if (photoError) {
        throw photoError;
      }

      let column = 1;

      for (const photo of photos || []) {
        const { data, error: signedUrlError } = await sb.storage
          .from("work-photos")
          .createSignedUrl(photo.path, 60);

        if (signedUrlError) {
          throw signedUrlError;
        }

        const blob = await fetch(data.signedUrl).then((response) =>
          response.blob()
        );
        const buffer = await blob.arrayBuffer();
        const extension = blob.type.includes("png") ? "png" : "jpeg";
        const image = workbook.addImage({ buffer, extension });

        photoSheet.addImage(image, {
          tl: { col: column - 1, row },
          ext: { width: 230, height: 170 }
        });

        photoSheet.getCell(row + 9, column).value = photo.stage;
        column += 4;
      }

      photoSheet.getRow(row).height = 125;
      row += 12;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([buffer]));
    anchor.download = `Daily_Report_${date}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  } catch (error) {
    console.error("Gagal membuat Excel:", error);
    toast(error.message);
  }
};

$("reportDate").value = new Date().toISOString().slice(0, 10);

// Aktifkan kembali jika service worker sudah siap.
// if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

init();
