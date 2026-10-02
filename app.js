const cfg = window.APP_CONFIG;

if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("PROJECT")) {
  alert("Isi config.js terlebih dahulu.");
  throw new Error("Konfigurasi Supabase belum lengkap.");
}

const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

let current = null;
let profile = null;
let reports = [];
let machines = [];
let technicians = [];
let active = null;

const $ = (id) => document.getElementById(id);

const toast = (message) => {
  const element = $("toast");
  if (!element) return;
  element.textContent = message;
  element.classList.remove("hidden");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => element.classList.add("hidden"), 3500);
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

// Membaca kolom database secara fleksibel, termasuk perbedaan huruf,
// underscore, spasi, dan singkatan seperti funcloc atau floc.
function getFlexibleField(object, aliases) {
  if (!object) return "";

  const normalizeKey = (value) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const normalizedAliases = aliases.map(normalizeKey);
  const matchingKey = Object.keys(object).find((key) =>
    normalizedAliases.includes(normalizeKey(key))
  );

  return matchingKey ? object[matchingKey] : "";
}

function getFunctionalLocation(machine) {
  return getFlexibleField(machine, [
    "functional_location",
    "functional location",
    "functionalLocation",
    "functional_loc",
    "function_location",
    "funcloc",
    "func_loc",
    "floc",
    "fun_loc",
    "f_location"
  ]);
}

function getEquipmentNumber(machine) {
  return getFlexibleField(machine, [
    "equipment_no",
    "equipment number",
    "equipment_number",
    "equipmentNo",
    "equipment",
    "equ_no",
    "equip_no"
  ]);
}

function getMachineGroup(machine) {
  return String(
    getFlexibleField(machine, [
      "machine_group",
      "machine group",
      "machineGroup",
      "group_name",
      "group"
    ]) || "GENERAL"
  ).trim().toUpperCase();
}

async function init() {
  const { data: { session }, error } = await sb.auth.getSession();
  if (error) return toast(error.message);
  if (session) await enter(session.user);
}

$("loginForm").onsubmit = async (event) => {
  event.preventDefault();
  const { data, error } = await sb.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });
  if (error) return toast(error.message);
  await enter(data.user);
};

async function enter(user) {
  current = user;
  const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (error) return toast("Profile belum dibuat oleh Admin");

  profile = data;
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("who").textContent = `${profile.full_name} • ${profile.role}`;

  document.querySelectorAll("nav button[data-page]").forEach((button) => {
    const allowed = button.classList.contains(profile.role) || profile.role === "admin";
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
    if (button.dataset.page === "create") await loadTechnicians();
    show(button.dataset.page);
  };
});

function show(id) {
  document.querySelectorAll(".page").forEach((page) => page.classList.add("hidden"));
  const page = $(id);
  if (page) page.classList.remove("hidden");
  render();
}

async function loadTechnicians() {
  const select = $("technicianSelect");
  if (!select) return;

  select.innerHTML = '<option value="">Memuat technician...</option>';
  const { data, error } = await sb
    .from("profiles")
    .select("id, full_name, section")
    .eq("role", "technician")
    .order("full_name", { ascending: true });

  if (error) {
    console.error(error);
    select.innerHTML = '<option value="">Gagal memuat technician</option>';
    return toast(error.message);
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
    const operatorGroup = String(profile.section || "").trim().toUpperCase();
    if (["RDS", "HMP", "GENERAL"].includes(operatorGroup)) {
      machineQuery = machineQuery.eq("machine_group", operatorGroup);
    } else {
      toast("Section Operator harus RDS, HMP, atau GENERAL.");
    }
  }

  let reportQuery = sb.from("reports_view").select("*").order("created_at", { ascending: false });
  if (profile.role === "technician") reportQuery = reportQuery.eq("technician_id", current.id);
  if (profile.role === "operator") reportQuery = reportQuery.eq("reporter_id", current.id);

  const [machineResult, reportResult] = await Promise.all([machineQuery, reportQuery]);
  if (machineResult.error || reportResult.error) {
    const error = machineResult.error || reportResult.error;
    console.error(error);
    return toast(error.message);
  }

  machines = machineResult.data || [];
  reports = reportResult.data || [];

  const groupDisplay = $("machineGroupDisplay");
  if (groupDisplay) {
    groupDisplay.value = profile.role === "operator"
      ? String(profile.section || "").trim().toUpperCase()
      : "SEMUA KELOMPOK";
  }

  resetMachineSelection();
  if (["operator", "admin"].includes(profile.role)) await loadTechnicians();
  render();
}

function resetMachineSelection() {
  const select = $("machineSelect");
  const input = $("machineSearchInput");
  const detail = $("machineDetail");
  const suggestions = $("machineSuggestions");
  if (select) select.innerHTML = '<option value="">Pilih mesin</option>';
  if (input) input.value = "";
  if (suggestions) {
    suggestions.innerHTML = "";
    suggestions.classList.add("hidden");
  }
  if (detail) detail.textContent = "Cari dan pilih mesin untuk menampilkan Functional Location dan Equipment Number.";
}

function machineLabel(machine) {
  return `[${getMachineGroup(machine)}] ${machine.code || ""} • ${machine.name || ""}`;
}

function renderMachineSuggestions(keyword = "") {
  const box = $("machineSuggestions");
  if (!box) return;
  const key = normalize(keyword);
  const found = machines.filter((machine) => {
    const haystack = [
      machine.code,
      machine.name,
      machine.section,
      getFunctionalLocation(machine),
      getEquipmentNumber(machine),
      getMachineGroup(machine)
    ].map(normalize).join(" ");
    return !key || haystack.includes(key);
  }).slice(0, 30);

  box.innerHTML = found.map((machine) => `
    <button type="button" class="machine-option" data-machine-id="${escapeHtml(machine.id)}">
      <b>${escapeHtml(machine.code || machine.name)}</b>
      <small>${escapeHtml(machineLabel(machine))}</small>
    </button>
  `).join("") || '<div class="machine-empty">Mesin tidak ditemukan.</div>';
  box.classList.remove("hidden");

  box.querySelectorAll("[data-machine-id]").forEach((button) => {
    button.onclick = () => selectMachine(button.dataset.machineId);
  });
}

function selectMachine(id) {
  const machine = machines.find((item) => String(item.id) === String(id));
  if (!machine) return toast("Data mesin tidak ditemukan.");

  const select = $("machineSelect");
  select.innerHTML = `<option value="${escapeHtml(machine.id)}" selected>${escapeHtml(machineLabel(machine))}</option>`;
  select.value = String(machine.id);
  $("machineSearchInput").value = machineLabel(machine);
  $("machineSuggestions").classList.add("hidden");

  const machineGroup = getMachineGroup(machine);
  const functionalLocation = getFunctionalLocation(machine);
  const equipmentNumber = getEquipmentNumber(machine);

  // Tampilan kelompok mengikuti mesin yang benar-benar dipilih.
  if ($("machineGroupDisplay")) {
    $("machineGroupDisplay").value = machineGroup;
  }

  $("machineDetail").innerHTML = `
    <b>${escapeHtml(machine.code || machine.name)}</b>
    <p>Nama: ${escapeHtml(machine.name || "-")}</p>
    <p>Group: ${escapeHtml(machineGroup)}</p>
    <p>Area/Section: ${escapeHtml(machine.section || "-")}</p>
    <p>Functional Location: ${escapeHtml(functionalLocation || "Data FunLoc kosong")}</p>
    <p>Equipment No.: ${escapeHtml(equipmentNumber || "Data Equipment kosong")}</p>
  `;
}

$("machineSearchInput").addEventListener("input", (event) => {
  $("machineSelect").value = "";
  renderMachineSuggestions(event.target.value);
});
$("machineSearchInput").addEventListener("focus", (event) => renderMachineSuggestions(event.target.value));
document.addEventListener("click", (event) => {
  if (!event.target.closest(".machine-search-wrap")) $("machineSuggestions").classList.add("hidden");
});

function render() {
  const openCount = reports.filter((item) => item.status === "OPEN").length;
  const closedCount = reports.filter((item) => item.status === "CLOSED").length;
  $("total").textContent = reports.length;
  $("open").textContent = openCount;
  $("closed").textContent = closedCount;
  $("progress").textContent = reports.length - openCount - closedCount;
  $("latest").innerHTML = reports.slice(0, 10).map(card).join("") || "Belum ada data";

  const jobs = reports.filter((item) => {
    const activeStatus = ["OPEN", "IN_PROGRESS", "RETURNED"].includes(item.status);
    return activeStatus && (profile.role === "admin" || item.technician_id === current.id);
  });

  $("jobList").innerHTML = jobs.map((item) => `
    <article class="card job">
      <span class="badge">${escapeHtml(item.status)}</span>
      <h3>${escapeHtml(item.report_no)} • ${escapeHtml(item.machine_name)}</h3>
      <p>${escapeHtml(item.problem)}</p>
      <p><b>Technician:</b> ${escapeHtml(item.technician_name || "-")}</p>
      <button type="button" onclick="startWork('${escapeHtml(item.id)}')">MULAI / LANJUTKAN</button>
      ${profile.role === "admin" ? `<button type="button" class="green" onclick="adminCloseJob('${escapeHtml(item.id)}')">ADMIN CLOSE</button>` : ""}
    </article>
  `).join("") || '<div class="card">Tidak ada pekerjaan.</div>';

  $("verifyList").innerHTML = reports.filter((item) => item.status === "REQUEST_CHECK").map((item) => `
    <article class="card job">
      <span class="badge">REQUEST CHECK</span>
      <h3>${escapeHtml(item.report_no)} • ${escapeHtml(item.machine_name)}</h3>
      <p>${escapeHtml(item.action || "")}</p>
      <button type="button" onclick="startVerify('${escapeHtml(item.id)}')">CEK HASIL</button>
    </article>
  `).join("") || '<div class="card">Belum ada Request Check.</div>';

  $("reportRows").innerHTML = reports.map((item) => `
    <tr><td>${escapeHtml(item.report_no)}</td><td>${escapeHtml(item.machine_name)}</td><td>${escapeHtml(item.problem)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.technician_name || "-")}</td></tr>
  `).join("");
}

function card(item) {
  return `<p><span class="badge">${escapeHtml(item.status)}</span> <b>${escapeHtml(item.report_no)} • ${escapeHtml(item.machine_name)}</b><br>${escapeHtml(item.problem)}</p>`;
}

async function upload(file, reportId, stage) {
  if (!file || !file.name || !file.size) return null;
  const extension = file.name.split(".").pop();
  const path = `${reportId}/${stage}-${Date.now()}.${extension}`;
  const { error } = await sb.storage.from("work-photos").upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { error: photoError } = await sb.from("photos").insert({ report_id: reportId, stage, path });
  if (photoError) throw photoError;
  return path;
}

$("createForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(event.target);
    const machineId = formData.get("machine_id");
    const technicianId = formData.get("technician_id");
    if (!machineId) throw new Error("Cari dan pilih mesin terlebih dahulu.");
    if (!technicianId) throw new Error("Pilih technician terlebih dahulu.");

    const reportNumber = `RPT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
    const { data, error } = await sb.from("reports").insert({
      report_no: reportNumber,
      machine_id: machineId,
      reporter_id: current.id,
      technician_id: technicianId,
      shift: formData.get("shift"),
      priority: formData.get("priority"),
      request_type: formData.get("request_type"),
      problem: formData.get("problem"),
      impact: formData.get("impact"),
      status: "OPEN"
    }).select().single();
    if (error) throw error;

    await upload(formData.get("photo"), data.id, "PROBLEM");
    event.target.reset();
    await load();
    show("dashboard");
    toast("Laporan berhasil dikirim ke technician");
  } catch (error) {
    console.error(error);
    toast(error.message);
  }
};

window.startWork = async (id) => {
  active = reports.find((item) => item.id === id);
  if (!active) return toast("Pekerjaan tidak ditemukan.");
  const isAdmin = profile.role === "admin";
  if (!isAdmin && active.technician_id !== current.id) return toast("Pekerjaan ini ditugaskan kepada technician lain.");

  if (active.status !== "IN_PROGRESS") {
    let query = sb.from("reports").update({ status: "IN_PROGRESS", start_at: active.start_at || new Date().toISOString() }).eq("id", id);
    if (!isAdmin) query = query.eq("technician_id", current.id);
    const { error } = await query;
    if (error) return toast(error.message);
    active.status = "IN_PROGRESS";
  }

  $("workTitle").innerHTML = `<b>${escapeHtml(active.report_no)} • ${escapeHtml(active.machine_name)}</b><p>${escapeHtml(active.problem)}</p><p><b>Technician:</b> ${escapeHtml(active.technician_name || "-")}</p>`;
  show("work");
};

$("workForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(event.target);
    let query = sb.from("reports").update({
      cause: formData.get("cause"), action: formData.get("action"), spare_part: formData.get("spare_part"), tech_note: formData.get("tech_note"),
      status: "REQUEST_CHECK", request_check_at: new Date().toISOString()
    }).eq("id", active.id);
    if (profile.role !== "admin") query = query.eq("technician_id", current.id);
    const { error } = await query;
    if (error) throw error;
    await upload(formData.get("photo"), active.id, "AFTER_REPAIR");
    event.target.reset();
    await load();
    show("jobs");
    toast("Request Check dikirim");
  } catch (error) { console.error(error); toast(error.message); }
};

window.startVerify = (id) => {
  active = reports.find((item) => item.id === id);
  if (!active) return toast("Laporan tidak ditemukan.");
  $("verifyTitle").innerHTML = `<b>${escapeHtml(active.report_no)} • ${escapeHtml(active.machine_name)}</b><p>${escapeHtml(active.action || "")}</p>`;
  show("verifyFormPage");
};

$("verifyForm").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const formData = new FormData(event.target);
    const decision = event.submitter.value;
    if (decision === "CLOSED" && formData.get("production_test") !== "NORMAL") throw new Error("Hasil harus NORMAL untuk Closed");
    const { error } = await sb.from("reports").update({
      production_test: formData.get("production_test"), production_note: formData.get("production_note"), status: decision,
      verifier_id: current.id, verified_at: new Date().toISOString(), closed_at: decision === "CLOSED" ? new Date().toISOString() : null
    }).eq("id", active.id);
    if (error) throw error;
    await upload(formData.get("photo"), active.id, "VERIFICATION");
    event.target.reset();
    await load();
    show("dashboard");
    toast(decision === "CLOSED" ? "Report Closed" : "Dikembalikan");
  } catch (error) { console.error(error); toast(error.message); }
};

window.adminCloseJob = async (id) => {
  if (profile.role !== "admin") return toast("Khusus Administrator.");
  const item = reports.find((report) => report.id === id);
  if (!item) return toast("Pekerjaan tidak ditemukan.");
  const note = prompt(`Catatan penutupan ${item.report_no}:`);
  if (!note || !note.trim()) return toast("Catatan penutupan wajib diisi.");
  if (!confirm(`Tutup pekerjaan ${item.report_no}?`)) return;
  const { error } = await sb.from("reports").update({
    status: "CLOSED", verifier_id: current.id, production_test: "NORMAL", production_note: note.trim(),
    verified_at: new Date().toISOString(), closed_at: new Date().toISOString()
  }).eq("id", id);
  if (error) return toast(error.message);
  await load();
  show("jobs");
  toast("Pekerjaan berhasil ditutup Administrator.");
};

$("machineForm").onsubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const { error } = await sb.from("machines").insert({
    code: formData.get("code").trim().toUpperCase(), name: formData.get("name").trim(), section: formData.get("section").trim(),
    machine_group: formData.get("machine_group"), active: true
  });
  if (error) return toast(error.message);
  event.target.reset();
  await load();
  toast("Mesin disimpan");
};

$("downloadExcel").onclick = async () => {
  try {
    const date = $("reportDate").value;
    if (!date) throw new Error("Pilih tanggal report terlebih dahulu.");
    const nextDate = new Date(`${date}T00:00:00`); nextDate.setDate(nextDate.getDate() + 1);
    const rows = reports.filter((r) => r.created_at >= `${date}T00:00:00` && r.created_at < `${nextDate.toISOString().slice(0,10)}T00:00:00`);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Detail");
    worksheet.columns = ["Report","Mesin","Section","Temuan","Dampak","Prioritas","Status","Operator","Teknisi","Penyebab","Tindakan","Spare Part"].map((header,index)=>({header,key:String(index),width:index<3?18:28}));
    rows.forEach((r)=>worksheet.addRow([r.report_no,r.machine_name,r.section,r.problem,r.impact,r.priority,r.status,r.reporter_name,r.technician_name,r.cause,r.action,r.spare_part]));
    const buffer = await workbook.xlsx.writeBuffer();
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([buffer])); anchor.download = `Daily_Report_${date}.xlsx`; anchor.click(); URL.revokeObjectURL(anchor.href);
  } catch (error) { console.error(error); toast(error.message); }
};

$("reportDate").value = new Date().toISOString().slice(0, 10);
init();
