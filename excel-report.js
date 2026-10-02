/*
  PIM Smart Work Report - Excel Manual + Dokumentasi
  File tambahan. Tidak mengubah login, app.js, create-user, atau database.
  Pasang SETELAH app.js pada index.html.
*/
(() => {
  const button = document.getElementById('downloadExcel');
  const dateInput = document.getElementById('reportDate');

  if (!button || !dateInput) {
    console.warn('Excel report: tombol atau input tanggal tidak ditemukan.');
    return;
  }

  function notify(message) {
    if (typeof toast === 'function') {
      toast(message);
    } else {
      alert(message);
    }
  }

  function formatDate(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('id-ID', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function getDateRange(date) {
    // Input tanggal diperlakukan sebagai tanggal lokal WIB untuk query harian.
    const start = new Date(`${date}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  function styleHeader(row) {
    row.height = 32;
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
    row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  async function getPhotoData(path) {
    const { data, error } = await sb.storage
      .from('work-photos')
      .createSignedUrl(path, 300);

    if (error) throw error;

    const response = await fetch(data.signedUrl);
    if (!response.ok) throw new Error(`Foto gagal diunduh: ${response.status}`);

    const blob = await response.blob();
    return {
      buffer: await blob.arrayBuffer(),
      extension: blob.type.includes('png') ? 'png' : 'jpeg'
    };
  }

  async function downloadReport() {
    const date = dateInput.value;
    if (!date) throw new Error('Pilih tanggal report terlebih dahulu.');
    if (typeof ExcelJS === 'undefined') throw new Error('Library ExcelJS belum dimuat.');
    if (typeof sb === 'undefined') throw new Error('Koneksi Supabase belum tersedia.');

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'MENYIAPKAN EXCEL...';
    notify('Menyiapkan Excel dan dokumentasi...');

    try {
      const range = getDateRange(date);
      const { data: rows, error: reportError } = await sb
        .from('reports_export_view')
        .select('*')
        .gte('created_at', range.start)
        .lt('created_at', range.end)
        .order('created_at', { ascending: true });

      if (reportError) throw reportError;
      if (!rows || rows.length === 0) {
        throw new Error('Tidak ada Maintenance Request pada tanggal tersebut.');
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'PIM Smart Work Report';
      workbook.created = new Date();

      const detail = workbook.addWorksheet('Maintenance Request');
      detail.views = [{ state: 'frozen', ySplit: 1 }];
      detail.columns = [
        { header: 'No.', key: 'no', width: 7 },
        { header: 'Nomor Request', key: 'report_no', width: 24 },
        { header: 'Tanggal Request', key: 'created_at', width: 22 },
        { header: 'Jenis Pekerjaan', key: 'request_type', width: 20 },
        { header: 'Kode Mesin', key: 'machine_code', width: 22 },
        { header: 'Nama Mesin', key: 'machine_name', width: 28 },
        { header: 'Machine Group', key: 'machine_group', width: 18 },
        { header: 'Section', key: 'section', width: 24 },
        { header: 'Functional Location', key: 'functional_location', width: 46 },
        { header: 'Equipment Number', key: 'sap_equipment', width: 26 },
        { header: 'Shift', key: 'shift', width: 15 },
        { header: 'Prioritas', key: 'priority', width: 15 },
        { header: 'Deskripsi Kerusakan / Permintaan', key: 'problem', width: 45 },
        { header: 'Dampak Operasional', key: 'impact', width: 40 },
        { header: 'Status', key: 'status', width: 20 },
        { header: 'Pelapor', key: 'reporter_name', width: 24 },
        { header: 'Technician', key: 'technician_name', width: 24 },
        { header: 'Penyebab', key: 'cause', width: 40 },
        { header: 'Tindakan', key: 'action', width: 45 },
        { header: 'Spare Part', key: 'spare_part', width: 30 },
        { header: 'Catatan Technician', key: 'tech_note', width: 40 },
        { header: 'Hasil Test', key: 'production_test', width: 18 },
        { header: 'Catatan Verifikasi', key: 'production_note', width: 40 },
        { header: 'SAP Notification', key: 'sap_notification', width: 22 },
        { header: 'Waktu Mulai', key: 'start_at', width: 22 },
        { header: 'Request Verification', key: 'request_check_at', width: 22 },
        { header: 'Waktu Verifikasi', key: 'verified_at', width: 22 },
        { header: 'Waktu Closed', key: 'closed_at', width: 22 }
      ];

      rows.forEach((report, index) => {
        detail.addRow({
          no: index + 1,
          report_no: report.report_no || '',
          created_at: formatDate(report.created_at),
          request_type: report.request_type || '',
          machine_code: report.machine_code || '',
          machine_name: report.machine_name || '',
          machine_group: report.machine_group || '',
          section: report.section || '',
          functional_location: report.functional_location || '',
          sap_equipment: report.sap_equipment || '',
          shift: report.shift || '',
          priority: report.priority || '',
          problem: report.problem || '',
          impact: report.impact || '',
          status: report.status || '',
          reporter_name: report.reporter_name || '',
          technician_name: report.technician_name || '',
          cause: report.cause || '',
          action: report.action || '',
          spare_part: report.spare_part || '',
          tech_note: report.tech_note || '',
          production_test: report.production_test || '',
          production_note: report.production_note || '',
          sap_notification: report.sap_notification || '',
          start_at: formatDate(report.start_at),
          request_check_at: formatDate(report.request_check_at),
          verified_at: formatDate(report.verified_at),
          closed_at: formatDate(report.closed_at)
        });
      });

      styleHeader(detail.getRow(1));
      detail.autoFilter = { from: 'A1', to: 'AB1' };
      detail.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.alignment = { vertical: 'top', wrapText: true };
          if (rowNumber % 2 === 0) {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F7FA' } };
          }
        }
      });

      const docs = workbook.addWorksheet('Dokumentasi');
      docs.getColumn('A').width = 34;
      docs.getColumn('B').width = 4;
      docs.getColumn('C').width = 34;
      docs.getColumn('D').width = 4;
      docs.getColumn('E').width = 34;

      const stageColumns = { PROBLEM: 1, AFTER_REPAIR: 3, VERIFICATION: 5 };
      let currentRow = 1;

      for (const report of rows) {
        docs.mergeCells(currentRow, 1, currentRow, 5);
        const title = docs.getCell(currentRow, 1);
        title.value = `${report.report_no} • ${report.machine_name || '-'}`;
        title.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
        title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
        title.alignment = { vertical: 'middle' };
        docs.getRow(currentRow).height = 26;

        docs.getCell(currentRow + 1, 1).value = 'Kondisi Awal';
        docs.getCell(currentRow + 1, 3).value = 'Hasil Pekerjaan';
        docs.getCell(currentRow + 1, 5).value = 'Verifikasi';
        [1, 3, 5].forEach((column) => {
          const cell = docs.getCell(currentRow + 1, column);
          cell.font = { bold: true };
          cell.alignment = { horizontal: 'center' };
        });

        const { data: photos, error: photoError } = await sb
          .from('photos')
          .select('stage, path')
          .eq('report_id', report.id);

        if (photoError) throw photoError;

        for (const photo of photos || []) {
          const column = stageColumns[photo.stage];
          if (!column || !photo.path) continue;

          try {
            const imageData = await getPhotoData(photo.path);
            const imageId = workbook.addImage(imageData);
            docs.addImage(imageId, {
              tl: { col: column - 1, row: currentRow + 1 },
              ext: { width: 240, height: 180 }
            });
          } catch (photoDownloadError) {
            console.error('Dokumentasi gagal dimuat:', photoDownloadError);
            docs.getCell(currentRow + 3, column).value = 'Dokumentasi tidak dapat dimuat';
          }
        }

        for (let rowNumber = currentRow + 2; rowNumber <= currentRow + 11; rowNumber += 1) {
          docs.getRow(rowNumber).height = 18;
        }
        currentRow += 13;
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Maintenance_Request_${date}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);

      notify(`${rows.length} Maintenance Request berhasil diekspor.`);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  // Menimpa handler download lama hanya untuk tombol Excel.
  button.onclick = async () => {
    try {
      await downloadReport();
    } catch (error) {
      console.error('Gagal membuat Excel:', error);
      notify(error.message || 'Gagal membuat Excel.');
      button.disabled = false;
      button.textContent = 'DOWNLOAD EXCEL + FOTO';
    }
  };
})();
