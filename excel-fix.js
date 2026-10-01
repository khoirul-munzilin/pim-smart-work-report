/* PIM Smart Work Report - safe Excel export override */
(function () {
  function fmt(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(value));
  }
  function label(stage) {
    return ({ PROBLEM: 'Foto Temuan', AFTER_REPAIR: 'Foto Hasil Perbaikan', VERIFICATION: 'Foto Verifikasi' })[stage] || stage || 'Foto';
  }
  async function exportExcel() {
    const button = document.getElementById('downloadExcel');
    const date = document.getElementById('reportDate').value;
    if (!date) return alert('Pilih tanggal report terlebih dahulu.');
    const oldText = button.textContent;
    button.disabled = true; button.textContent = 'MEMBUAT EXCEL...';
    try {
      const start = `${date}T00:00:00+07:00`;
      const next = new Date(`${date}T00:00:00+07:00`);
      next.setUTCDate(next.getUTCDate() + 1);
      const end = next.toISOString();
      const { data: rows, error } = await sb.from('reports_view').select('*')
        .gte('created_at', start).lt('created_at', end).order('created_at');
      if (error) throw error;
      if (!rows || !rows.length) throw new Error(`Tidak ada laporan pada tanggal ${date}.`);

      const wb = new ExcelJS.Workbook();
      wb.creator = 'PIM Smart Work Report';
      const summary = wb.addWorksheet('Ringkasan');
      const closed = rows.filter(r => r.status === 'CLOSED').length;
      summary.addRows([
        ['DAILY ENGINEERING REPORT', date], ['Total Pekerjaan', rows.length],
        ['Closed', closed], ['Belum Closed', rows.length - closed]
      ]);
      summary.getColumn(1).width = 28; summary.getColumn(2).width = 24;
      summary.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123A60' } };

      const detail = wb.addWorksheet('Detail Pekerjaan');
      detail.columns = [
        ['No',7],['Report',23],['Mesin',20],['Kode Mesin',24],['Section',16],['Shift',12],
        ['Prioritas',13],['Temuan',35],['Dampak',35],['Status',18],['Operator',22],
        ['Teknisi',22],['Penyebab',35],['Tindakan',40],['Spare Part',25],['Hasil Test',18],
        ['Verifikator',22],['Catatan Produksi',35],['Dibuat',22],['Closed',22]
      ].map((x,i)=>({header:x[0],key:String(i),width:x[1]}));
      rows.forEach((r,i)=>detail.addRow([
        i+1,r.report_no,r.machine_name,r.machine_code,r.section,r.shift,r.priority,r.problem,r.impact,
        r.status,r.reporter_name,r.technician_name,r.cause,r.action,r.spare_part,r.production_test,
        r.verifier_name,r.production_note,fmt(r.created_at),fmt(r.closed_at)
      ]));
      detail.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
      detail.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF124E78'}};
      detail.views=[{state:'frozen',ySplit:1}]; detail.autoFilter={from:'A1',to:'T1'};
      detail.eachRow((r,n)=>{r.alignment={vertical:'top',wrapText:true};if(n>1)r.height=42;});

      const photosSheet = wb.addWorksheet('Dokumentasi Foto');
      for(let c=1;c<=12;c++) photosSheet.getColumn(c).width=15;
      let rowNo=1;
      for(const report of rows){
        photosSheet.mergeCells(`A${rowNo}:L${rowNo}`);
        const title=photosSheet.getCell(`A${rowNo}`);
        title.value=`${report.report_no} | ${report.machine_name} | ${report.status}`;
        title.font={bold:true,color:{argb:'FFFFFFFF'}};
        title.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF123A60'}};
        rowNo+=2;
        const {data:photos,error:photoError}=await sb.from('photos').select('*').eq('report_id',report.id).order('created_at');
        if(photoError) throw photoError;
        if(!photos || !photos.length){photosSheet.getCell(`A${rowNo}`).value='Tidak ada foto';rowNo+=3;continue;}
        let success=0;
        for(const photo of photos){
          const {data:signed,error:signedError}=await sb.storage.from('work-photos').createSignedUrl(photo.path,300);
          if(signedError){console.error(signedError);continue;}
          const response=await fetch(signed.signedUrl); if(!response.ok) continue;
          const blob=await response.blob();
          const imageId=wb.addImage({buffer:await blob.arrayBuffer(),extension:blob.type.includes('png')?'png':'jpeg'});
          const pos=success%3, group=Math.floor(success/3), col=pos*4, imageRow=rowNo+group*13;
          photosSheet.addImage(imageId,{tl:{col,row:imageRow-1},ext:{width:270,height:190}});
          const letter=['A','E','I'][pos];
          photosSheet.getCell(`${letter}${imageRow+10}`).value=label(photo.stage);
          photosSheet.getCell(`${letter}${imageRow+10}`).font={bold:true};
          success++;
        }
        rowNo += Math.max(1,Math.ceil(success/3))*13+2;
      }

      const open = wb.addWorksheet('Belum Selesai');
      open.columns=[['No',7],['Report',23],['Mesin',20],['Section',16],['Temuan',35],['Prioritas',13],['Status',18],['Teknisi',22]].map((x,i)=>({header:x[0],key:String(i),width:x[1]}));
      rows.filter(r=>r.status!=='CLOSED').forEach((r,i)=>open.addRow([i+1,r.report_no,r.machine_name,r.section,r.problem,r.priority,r.status,r.technician_name]));
      open.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
      open.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFC55A11'}};

      const buffer=await wb.xlsx.writeBuffer();
      const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const a=document.createElement('a'); a.href=url; a.download=`PIM_Engineering_Report_${date}.xlsx`; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      alert(`Excel berhasil dibuat. Jumlah pekerjaan: ${rows.length}`);
    } catch (e) {
      console.error('EXCEL FIX ERROR', e); alert('Gagal membuat Excel: '+(e.message||e));
    } finally { button.disabled=false; button.textContent=oldText; }
  }
  window.addEventListener('load', function () {
    const b=document.getElementById('downloadExcel');
    if(b) b.onclick=exportExcel;
  });
})();
