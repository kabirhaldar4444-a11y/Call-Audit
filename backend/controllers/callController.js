const supabase = require('../config/supabase');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { saveToLocalFile, getCallsFromLocalFile } = require('../utils/dataPersistence');

const parseExcelDate = (dateVal) => {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return dateVal;
  
  if (typeof dateVal === 'number') {
    return new Date((dateVal - 25569) * 86400 * 1000);
  }
  
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (!trimmed || trimmed === '--') return new Date();
    
    // Check if it's a number string (Excel serial date represented as a string)
    const num = parseFloat(trimmed);
    if (!isNaN(num) && String(num) === trimmed) {
      return new Date((num - 25569) * 86400 * 1000);
    }
    
    // Try standard parsing
    const standardParsed = new Date(trimmed);
    if (!isNaN(standardParsed.getTime())) return standardParsed;
    
    // Parse DD-MM-YYYY or DD/MM/YYYY format manually (common in India / Excel exports)
    const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
    const match = trimmed.match(dmyRegex);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // 0-indexed month
      const year = parseInt(match[3], 10);
      const hour = parseInt(match[4] || '0', 10);
      const minute = parseInt(match[5] || '0', 10);
      const second = parseInt(match[6] || '0', 10);
      
      // Create date in local timezone
      return new Date(year, month, day, hour, minute, second);
    }
  }
  
  return new Date();
};

const formatExcelDuration = (val) => {
  if (!val) return '00:00';
  
  let dateObj = null;
  if (val instanceof Date) {
    dateObj = val;
  } else if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.includes('1899') || trimmed.includes('1900') || trimmed.includes('Dec 30') || trimmed.includes('Dec 31')) {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        dateObj = parsed;
      }
    }
  }

  if (dateObj) {
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const mm = String(dateObj.getMinutes()).padStart(2, '0');
    const ss = String(dateObj.getSeconds()).padStart(2, '0');
    return hh === '00' ? `${mm}:${ss}` : `${hh}:${mm}:${ss}`;
  }

  return String(val).trim();
};

// Helper to map snake_case columns from Postgres to camelCase for the frontend
const mapCallToFrontend = (call) => {
  if (!call) return null;
  return {
    _id: call.id,
    callId: call.call_id,
    agentName: call.agent_name,
    agentEmail: call.agent_email,
    customerName: call.customer_name,
    process: call.process,
    date: call.date,
    phoneNumber: call.phone_number,
    duration: formatExcelDuration(call.duration),
    talktime: formatExcelDuration(call.talktime),
    dispose: call.dispose,
    remarks: call.remarks,
    audioUrl: call.audio_url,
    audioFilename: call.audio_filename,
    uploadedBy: call.users ? {
      id: call.users.id,
      _id: call.users.id,
      username: call.users.username,
      email: call.users.email
    } : call.uploaded_by,
    status: call.status,
    isActive: call.is_active,
    createdAt: call.created_at,
    updatedAt: call.updated_at,
    auditorName: call.auditor_name
  };
};

const getAllCalls = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Local fallback if offline mode
    if (process.env.DB_MODE === 'offline') {
      let callsLocal = getCallsFromLocalFile(req.query);
      
      // Global search filtering locally
      if (req.query.search) {
        const searchVal = req.query.search.toLowerCase();
        callsLocal = callsLocal.filter(c => 
          (c.agentName && c.agentName.toLowerCase().includes(searchVal)) ||
          (c.callId && c.callId.toLowerCase().includes(searchVal)) ||
          (c.process && c.process.toLowerCase().includes(searchVal)) ||
          (c.agentEmail && c.agentEmail.toLowerCase().includes(searchVal)) ||
          (c.talktime && c.talktime.toLowerCase().includes(searchVal)) ||
          (c.dispose && c.dispose.toLowerCase().includes(searchVal))
        );
      }
      
      if (req.query.callId) {
        callsLocal = callsLocal.filter(c => c.callId && c.callId.toLowerCase().includes(req.query.callId.toLowerCase()));
      }
      if (req.query.agentName) {
        callsLocal = callsLocal.filter(c => c.agentName && c.agentName.toLowerCase().includes(req.query.agentName.toLowerCase()));
      }
      if (req.query.agentEmail) {
        callsLocal = callsLocal.filter(c => c.agentEmail && c.agentEmail.toLowerCase().includes(req.query.agentEmail.toLowerCase()));
      }
      if (req.query.talktime) {
        callsLocal = callsLocal.filter(c => c.talktime && c.talktime.toLowerCase().includes(req.query.talktime.toLowerCase()));
      }
      if (req.query.dispose) {
        callsLocal = callsLocal.filter(c => c.dispose && c.dispose.toLowerCase().includes(req.query.dispose.toLowerCase()));
      }
      if (req.query.status) {
        callsLocal = callsLocal.filter(c => c.status === req.query.status);
      }
      if (req.query.auditorName) {
        callsLocal = callsLocal.filter(c => c.auditorName === req.query.auditorName);
      }

      const total = callsLocal.length;
      const paginatedLocal = callsLocal.slice(skip, skip + limit);
      return res.status(200).json({
        message: 'Calls retrieved successfully',
        data: paginatedLocal,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        },
        databaseMode: 'offline'
      });
    }

    // Build Supabase query
    let query = supabase
      .from('calls')
      .select('*, users(id, username, email)', { count: 'exact' })
      .eq('is_active', true);

    // Global search or individual field searches
    if (req.query.search) {
      const searchVal = `%${req.query.search}%`;
      query = query.or(`agent_name.ilike.${searchVal},call_id.ilike.${searchVal},process.ilike.${searchVal},agent_email.ilike.${searchVal},talktime.ilike.${searchVal},dispose.ilike.${searchVal}`);
    } else {
      if (req.query.callId) query = query.ilike('call_id', `%${req.query.callId}%`);
      if (req.query.agentName) query = query.ilike('agent_name', `%${req.query.agentName}%`);
      if (req.query.agentEmail) query = query.ilike('agent_email', `%${req.query.agentEmail}%`);
      if (req.query.talktime) query = query.ilike('talktime', `%${req.query.talktime}%`);
      if (req.query.dispose) query = query.ilike('dispose', `%${req.query.dispose}%`);
    }

    if (req.query.process) query = query.ilike('process', `%${req.query.process}%`);
    if (req.query.status) query = query.eq('status', req.query.status);
    if (req.query.auditorName) query = query.eq('auditor_name', req.query.auditorName);
    
    // Date range — use IST offset (+05:30) for consistent Indian timezone filtering
    if (req.query.dateFrom) {
      let fromDateStr = req.query.dateFrom;
      if (fromDateStr.length === 10) {
        // Construct start-of-day in IST and convert to UTC ISO string
        fromDateStr = new Date(fromDateStr + 'T00:00:00+05:30').toISOString();
      }
      query = query.gte('date', fromDateStr);
    }
    if (req.query.dateTo) {
      let toDateStr = req.query.dateTo;
      if (toDateStr.length === 10) {
        // Construct end-of-day in IST and convert to UTC ISO string
        toDateStr = new Date(toDateStr + 'T23:59:59.999+05:30').toISOString();
      }
      query = query.lte('date', toDateStr);
    }

    // Sorting
    const sortField = req.query.sortField || 'date';
    const sortOrder = req.query.sortOrder === 'asc';
    let pgSortField = 'date';
    if (sortField === 'callId') pgSortField = 'call_id';
    else if (sortField === 'agentName') pgSortField = 'agent_name';
    else if (sortField === 'duration') pgSortField = 'duration';
    else if (sortField === 'talktime') pgSortField = 'talktime';
    else if (sortField === 'dispose') pgSortField = 'dispose';

    query = query.order(pgSortField, { ascending: sortOrder }).range(skip, skip + limit - 1);

    const { data: calls, count, error } = await query;
    if (error) throw new Error(error.message);

    res.status(200).json({
      message: 'Calls retrieved successfully',
      data: calls.map(mapCallToFrontend),
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      },
      databaseMode: 'online'
    });
  } catch (error) {
    console.error('Error in getAllCalls:', error);
    res.status(500).json({ message: 'Error retrieving calls', error: error.message });
  }
};

const getCallById = async (req, res) => {
  try {
    const { id } = req.params;

    if (process.env.DB_MODE === 'offline') {
      const callsLocal = getCallsFromLocalFile({});
      const call = callsLocal.find(c => c._id === id);
      if (!call) return res.status(404).json({ message: 'Call not found' });
      return res.status(200).json({ message: 'Call retrieved successfully', data: call });
    }

    const { data: call, error } = await supabase
      .from('calls')
      .select('*, users(id, username, email)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!call) return res.status(404).json({ message: 'Call not found' });

    res.status(200).json({
      message: 'Call retrieved successfully',
      data: mapCallToFrontend(call),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving call', error: error.message });
  }
};

const createCall = async (req, res) => {
  try {
    const { callId, agentName, date, phoneNumber, duration, talktime, dispose, remarks } = req.body;

    if (!callId || !agentName || !date) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    if (process.env.DB_MODE === 'offline') {
      const newCall = {
        _id: 'call-' + Date.now(),
        callId,
        agentName,
        date: new Date(date).toISOString(),
        phoneNumber,
        duration,
        talktime,
        dispose,
        remarks,
        audioUrl: '',
        uploadedBy: req.userId,
        status: 'pending',
        isActive: true,
        createdAt: new Date().toISOString()
      };
      saveToLocalFile(newCall);
      return res.status(201).json({ message: 'Call created successfully', data: newCall });
    }

    const { data: existingCall } = await supabase
      .from('calls')
      .select('id')
      .eq('call_id', callId)
      .maybeSingle();

    if (existingCall) {
      return res.status(400).json({ message: 'Call with this ID already exists' });
    }

    const { data: newCall, error } = await supabase
      .from('calls')
      .insert([{
        call_id: callId,
        agent_name: agentName,
        date: new Date(date).toISOString(),
        phone_number: phoneNumber,
        duration,
        talktime,
        dispose,
        remarks,
        audio_url: '',
        uploaded_by: req.userId,
        status: 'pending',
        is_active: true
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);

    res.status(201).json({
      message: 'Call created successfully',
      data: mapCallToFrontend(newCall),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating call', error: error.message });
  }
};

const uploadCallData = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an Excel or CSV file' });
    }

    const workbook = xlsx.readFile(req.file.path, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    const results = {
      total: data.length,
      success: 0,
      failed: 0,
      errors: [],
      databaseMode: process.env.DB_MODE || 'online'
    };

    const seenIdsInBatch = new Set();
    const allRowsToInsert = [];

    for (const row of data) {
      try {
        const normalizedRow = {};
        Object.keys(row).forEach(key => {
          const normalizedKey = key.toLowerCase().trim().replace(/_/g, ' ').replace(/\s+/g, ' ');
          normalizedRow[normalizedKey] = row[key];
        });

        const rawCallId = 
          normalizedRow['call id'] || 
          normalizedRow['callid'] || 
          normalizedRow['id'] || 
          normalizedRow['s no'] || 
          normalizedRow['serial number'] || 
          normalizedRow['lead id'] ||
          Object.values(row)[0];

        let callId = String(rawCallId || '').trim();

        if (!callId) {
          callId = `GEN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        }

        let uniqueCallId = callId;
        let counter = 1;
        while (seenIdsInBatch.has(uniqueCallId)) {
          uniqueCallId = `${callId}_${counter}`;
          counter++;
        }
        seenIdsInBatch.add(uniqueCallId);

        const agentName = String(normalizedRow['agent full name'] || normalizedRow['agent name'] || normalizedRow['agent'] || normalizedRow['agentname'] || normalizedRow['staff'] || 'Unknown Agent').trim();
        const agentEmail = String(normalizedRow['agent email'] || normalizedRow['email'] || normalizedRow['agentemail'] || '').toLowerCase().trim();
        const processName = String(normalizedRow['process'] || normalizedRow['dept'] || normalizedRow['department'] || 'General').trim();
        
        let dateVal = normalizedRow['date'] || normalizedRow['date time'] || normalizedRow['date & time'] || normalizedRow['timestamp'] || normalizedRow['time'] || normalizedRow['date-time'];
        let finalDate = parseExcelDate(dateVal);

                const phoneNumber = String(normalizedRow['phone number'] || normalizedRow['phone'] || normalizedRow['customer number'] || normalizedRow['mobile'] || '').trim();
        
        const durationVal = normalizedRow['duration'] || normalizedRow['call duration'] || normalizedRow['call time'] || normalizedRow['length'] || '';
        const duration = formatExcelDuration(durationVal);

        const talktimeVal = normalizedRow['talktime'] || normalizedRow['talk time'] || '';
        const talktime = formatExcelDuration(talktimeVal);

        // Smart dispose: handle duplicate DISPOSE columns (XLSX renames 2nd to dispose_1 -> "dispose 1")
        let rawDispose = normalizedRow['dispose'] || '';
        const dispose1 = normalizedRow['dispose 1'] || '';
        const firstDispose = normalizedRow['first dispose'] || '';
        const isTimeVal = /^\d{1,2}:\d{2}(:\d{2})?$/.test(String(rawDispose).trim());
        const dispose = String(
          isTimeVal
            ? (dispose1 || firstDispose || normalizedRow['disposition'] || rawDispose)
            : (rawDispose || normalizedRow['disposition'] || '')
        ).trim();
        
        const remarks = String(normalizedRow['remarks'] || normalizedRow['comment'] || '').trim();
        const customerName = String(normalizedRow['customer name'] || normalizedRow['customer'] || '').trim();
        const recordingPath = String(normalizedRow['recording path'] || normalizedRow['audio link'] || normalizedRow['audio url'] || normalizedRow['recording link'] || '').trim();

        const insertData = {
          call_id: uniqueCallId,
          agent_name: agentName,
          agent_email: agentEmail,
          process: processName,
          date: finalDate.toISOString(),
          phone_number: phoneNumber,
          duration,
          talktime,
          dispose,
          remarks,
          customer_name: customerName,
          uploaded_by: req.userId,
          is_active: true
        };

        if (recordingPath) {
          insertData.audio_url = recordingPath;
        }

        allRowsToInsert.push(insertData);
      } catch (err) {
        results.failed++;
        results.errors.push(`Row parsing error: ${err.message}`);
      }
    }

    const batchSize = 2000;
    for (let i = 0; i < allRowsToInsert.length; i += batchSize) {
      const batch = allRowsToInsert.slice(i, i + batchSize);
      try {
        if (process.env.DB_MODE === 'offline') {
          for (const item of batch) {
            saveToLocalFile(mapCallToFrontend(item));
          }
          results.success += batch.length;
        } else {
          const { error } = await supabase
            .from('calls')
            .insert(batch);

          if (error) {
            console.log(`⚠️ Batch ${Math.floor(i / batchSize) + 1} insertion failed: ${error.message}. Falling back to row-by-row...`);
            for (const item of batch) {
              try {
                const { error: singleError } = await supabase
                  .from('calls')
                  .insert([item]);
                if (singleError) throw singleError;
                results.success++;
              } catch (singleErr) {
                results.failed++;
                if (singleErr.code === '23505') {
                  results.errors.push(`Call ID ${item.call_id} already exists (Duplicate)`);
                } else {
                  results.errors.push(`Call ID ${item.call_id}: ${singleErr.message}`);
                }
              }
            }
          } else {
            results.success += batch.length;
          }
        }
      } catch (batchErr) {
        console.error(`❌ Batch error:`, batchErr);
        for (const item of batch) {
          try {
            if (process.env.DB_MODE === 'offline') {
              saveToLocalFile(mapCallToFrontend(item));
              results.success++;
            } else {
              const { error: singleError } = await supabase
                .from('calls')
                .insert([item]);
              if (singleError) throw singleError;
              results.success++;
            }
          } catch (singleErr) {
            results.failed++;
            results.errors.push(`Call ID ${item.call_id}: ${singleErr.message}`);
          }
        }
      }
    }

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    console.log(`✅ Upload complete: ${results.success} success, ${results.failed} failed`);
    res.status(200).json({
      message: 'Call data uploaded successfully',
      data: results,
    });
  } catch (error) {
    console.error('❌ UPLOAD ERROR:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    
    let errorMessage = 'Error uploading data';
    if (error.code === '23505') errorMessage = 'Duplicate Call IDs detected in the system.';
    else if (error.message) errorMessage = error.message;

    res.status(500).json({ message: errorMessage, error: error.message, databaseMode: process.env.DB_MODE || 'online' });
  }
};

const deleteCalls = async (req, res) => {
  try {
    const { ids, dateFrom, dateTo } = req.body;

    if (process.env.DB_MODE === 'offline') {
      const callsLocal = getCallsFromLocalFile({});
      let remainingCalls = [];
      let deletedCount = 0;

      if (dateFrom || dateTo) {
        let fromVal = dateFrom;
        if (fromVal && fromVal.length === 10) {
          fromVal = new Date(fromVal + 'T00:00:00+05:30').toISOString();
        }
        let toVal = dateTo;
        if (toVal && toVal.length === 10) {
          toVal = new Date(toVal + 'T23:59:59.999+05:30').toISOString();
        }

        const fromDate = fromVal ? new Date(fromVal) : null;
        const toDate = toVal ? new Date(toVal) : null;

        remainingCalls = callsLocal.filter(c => {
          const cDate = new Date(c.date);
          const matchesFrom = fromDate ? cDate >= fromDate : true;
          const matchesTo = toDate ? cDate <= toDate : true;
          if (matchesFrom && matchesTo) {
            deletedCount++;
            return false;
          }
          return true;
        });
      } else if (ids && Array.isArray(ids) && ids.length > 0) {
        remainingCalls = callsLocal.filter(c => {
          if (ids.includes(c._id) || ids.includes(c.id)) {
            deletedCount++;
            return false;
          }
          return true;
        });
      } else {
        return res.status(400).json({ message: 'Please provide IDs or date range to delete' });
      }

      const fs = require('fs');
      const { getDataStorePath } = require('../utils/dataPersistence');
      fs.writeFileSync(getDataStorePath(), JSON.stringify(remainingCalls, null, 2));
      return res.status(200).json({ message: `${deletedCount} records deleted successfully` });
    }

    if (dateFrom || dateTo) {
      let query = supabase.from('calls').delete();
      if (dateFrom) {
        let fromVal = dateFrom;
        if (fromVal.length === 10) {
          fromVal = new Date(fromVal + 'T00:00:00+05:30').toISOString();
        }
        query = query.gte('date', fromVal);
      }
      if (dateTo) {
        let toVal = dateTo;
        if (toVal.length === 10) {
          toVal = new Date(toVal + 'T23:59:59.999+05:30').toISOString();
        }
        query = query.lte('date', toVal);
      }
      const { error } = await query;
      if (error) throw new Error(error.message);
      return res.status(200).json({ message: 'Records in date range deleted successfully' });
    } else if (ids && Array.isArray(ids) && ids.length > 0) {
      const { error } = await supabase
        .from('calls')
        .delete()
        .in('id', ids);

      if (error) throw new Error(error.message);
      return res.status(200).json({ message: `${ids.length} records deleted successfully` });
    } else {
      return res.status(400).json({ message: 'Please provide IDs or date range to delete' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting records', error: error.message });
  }
};

const uploadAudio = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Please upload audio files' });
    }
    const results = { total: req.files.length, success: 0, failed: 0, errors: [] };
    
    for (const file of req.files) {
      try {
        const callId = path.basename(file.originalname, path.extname(file.originalname)).trim();
        
        if (process.env.DB_MODE === 'offline') {
          // Offline storage mapping
          results.success++;
        } else {
          const { data: call, error: findError } = await supabase
            .from('calls')
            .select('id')
            .eq('call_id', callId)
            .maybeSingle();

          if (findError) throw findError;

          if (!call) {
            results.failed++;
            results.errors.push(`No call record found matching filename: ${file.originalname}`);
            continue;
          }

          const { error: updateError } = await supabase
            .from('calls')
            .update({
              audio_url: `/uploads/audio/${file.filename}`,
              audio_filename: file.filename
            })
            .eq('id', call.id);

          if (updateError) throw updateError;
          results.success++;
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`Error processing file ${file.originalname}: ${err.message}`);
      }
    }
    res.status(200).json({ message: 'Audio files processed successfully', data: results });
  } catch (error) {
    res.status(500).json({ message: 'Error uploading audio files', error: error.message });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayStartIso = todayStart.toISOString();
    const todayEndIso = todayEnd.toISOString();

    if (process.env.DB_MODE === 'offline') {
      const callsLocal = getCallsFromLocalFile({});
      const totalCalls = callsLocal.length;
      const pendingCalls = callsLocal.filter(c => c.status === 'pending').length;
      const auditedCalls = callsLocal.filter(c => c.status === 'audited').length;
      const todaysCalls = callsLocal.filter(c => c.date >= todayStartIso && c.date <= todayEndIso).length;
      const todaysPendingCalls = callsLocal.filter(c => c.status === 'pending' && c.date >= todayStartIso && c.date <= todayEndIso).length;
      return res.status(200).json({
        message: 'Dashboard stats retrieved successfully',
        data: { 
          totalCalls, 
          pendingCalls, 
          auditedCalls, 
          todaysCalls, 
          todaysPendingCalls, 
          callsInLast7Days: 0, 
          databaseMode: 'offline' 
        }
      });
    }

    const { count: totalCalls, error: err1 } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const { count: pendingCalls, error: err2 } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('is_active', true);

    const { count: auditedCalls, error: err3 } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'audited')
      .eq('is_active', true);

    const { count: todaysCalls, error: err5 } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .gte('date', todayStartIso)
      .lte('date', todayEndIso)
      .eq('is_active', true);

    const { count: todaysPendingCalls, error: err6 } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .gte('date', todayStartIso)
      .lte('date', todayEndIso)
      .eq('status', 'pending')
      .eq('is_active', true);

    if (err1 || err2 || err3 || err5 || err6) {
      throw new Error((err1 || err2 || err3 || err5 || err6).message);
    }

    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    
    const { count: callsInLast7Days, error: err4 } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .gte('date', last7Days.toISOString())
      .eq('is_active', true);

    res.status(200).json({ 
      message: 'Dashboard stats retrieved successfully', 
      data: { 
        totalCalls: totalCalls || 0, 
        pendingCalls: pendingCalls || 0, 
        auditedCalls: auditedCalls || 0,
        todaysCalls: todaysCalls || 0,
        todaysPendingCalls: todaysPendingCalls || 0,
        callsInLast7Days: callsInLast7Days || 0,
        databaseMode: 'online'
      } 
    });
  } catch (error) {
    console.error('Error retrieving dashboard stats:', error);
    res.status(500).json({ message: 'Error retrieving dashboard stats', error: error.message });
  }
};

const updateCallStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'audited'].includes(status)) {
      return res.status(400).json({ status: 'error', message: 'Invalid status' });
    }

    if (process.env.DB_MODE === 'offline') {
      const callsLocal = getCallsFromLocalFile({});
      const callIndex = callsLocal.findIndex(c => c._id === id || c.id === id);
      if (callIndex > -1) {
        const updatedCall = {
          ...callsLocal[callIndex],
          status,
          updatedAt: new Date().toISOString()
        };
        saveToLocalFile(updatedCall);
        res.json({ status: 'success', data: updatedCall });
      } else {
        res.status(404).json({ status: 'error', message: 'Call not found' });
      }
    } else {
      const { data: call, error } = await supabase
        .from('calls')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      if (!call) return res.status(404).json({ status: 'error', message: 'Call not found' });
      res.json({ status: 'success', data: mapCallToFrontend(call) });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const updateCall = async (req, res) => {
  try {
    const { id } = req.params;
    const { agentName, process: callProcess, status, duration, talktime, dispose, auditorName } = req.body;
    
    // Role-based validation: normal persons can only update status and auditorName
    const isAdmin = req.userRole === 'admin' || req.userRole === 'superadmin';
    if (!isAdmin) {
      if (agentName !== undefined || callProcess !== undefined || duration !== undefined || talktime !== undefined || dispose !== undefined) {
        return res.status(403).json({ status: 'error', message: 'You do not have permission to edit agent details, process, duration, talktime, or dispose.' });
      }
    }
    
    if (process.env.DB_MODE === 'offline') {
      const callsLocal = getCallsFromLocalFile({});
      const callIndex = callsLocal.findIndex(c => c._id === id || c.id === id);
      if (callIndex > -1) {
        const updatedCall = {
          ...callsLocal[callIndex],
          agentName: agentName !== undefined ? agentName : callsLocal[callIndex].agentName,
          process: callProcess !== undefined ? callProcess : callsLocal[callIndex].process,
          status: status !== undefined ? status : callsLocal[callIndex].status,
          duration: duration !== undefined ? formatExcelDuration(duration) : callsLocal[callIndex].duration,
          talktime: talktime !== undefined ? formatExcelDuration(talktime) : callsLocal[callIndex].talktime,
          dispose: dispose !== undefined ? dispose : callsLocal[callIndex].dispose,
          auditorName: auditorName !== undefined ? auditorName : callsLocal[callIndex].auditorName,
          updatedAt: new Date().toISOString()
        };
        saveToLocalFile(updatedCall);
        res.json({ status: 'success', data: updatedCall });
      } else {
        res.status(404).json({ status: 'error', message: 'Call not found' });
      }
    } else {
      const updateData = {};
      if (agentName !== undefined) updateData.agent_name = agentName;
      if (callProcess !== undefined) updateData.process = callProcess;
      if (status !== undefined) updateData.status = status;
      if (duration !== undefined) updateData.duration = formatExcelDuration(duration);
      if (talktime !== undefined) updateData.talktime = formatExcelDuration(talktime);
      if (dispose !== undefined) updateData.dispose = dispose;
      if (auditorName !== undefined) updateData.auditor_name = auditorName;
      
      let resultCall = null;
      const { data: call, error } = await supabase
        .from('calls')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
        
      if (error) {
        if (error.message && error.message.includes('auditor_name')) {
          console.warn('⚠️ auditor_name column does not exist. Retrying update without it...');
          delete updateData.auditor_name;
          const retry = await supabase
            .from('calls')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
          if (retry.error) throw new Error(retry.error.message);
          resultCall = retry.data;
        } else {
          throw new Error(error.message);
        }
      } else {
        resultCall = call;
      }
      
      if (!resultCall) return res.status(404).json({ status: 'error', message: 'Call not found' });
      res.json({ status: 'success', data: mapCallToFrontend(resultCall) });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const getCallsByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        message: 'Please provide startDate and endDate in query parameters' 
      });
    }

    let start;
    let end;
    if (startDate.length === 10) {
      start = new Date(startDate + 'T00:00:00+05:30');
    } else {
      start = new Date(startDate);
    }
    if (endDate.length === 10) {
      end = new Date(endDate + 'T23:59:59.999+05:30');
    } else {
      end = new Date(endDate);
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ 
        message: 'Invalid date format. Use YYYY-MM-DD' 
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (process.env.DB_MODE === 'offline') {
      const callsLocal = getCallsFromLocalFile(req.query);
      const startIso = start.toISOString();
      const endIso = end.toISOString();
      const filtered = callsLocal.filter(c => c.date >= startIso && c.date <= endIso);
      const total = filtered.length;
      const paginatedLocal = filtered.slice(skip, skip + limit);
      return res.status(200).json({
        message: 'Calls retrieved by date range successfully',
        data: paginatedLocal,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          dateRange: { start: startDate, end: endDate }
        },
        databaseMode: 'offline'
      });
    }

    let query = supabase
      .from('calls')
      .select('*, users(id, username, email)', { count: 'exact' })
      .eq('is_active', true)
      .gte('date', start.toISOString())
      .lte('date', end.toISOString());

    if (req.query.agentName) {
      query = query.ilike('agent_name', `%${req.query.agentName}%`);
    }

    if (req.query.process) {
      query = query.ilike('process', `%${req.query.process}%`);
    }

    if (req.query.status) {
      query = query.eq('status', req.query.status);
    }

    query = query.order('date', { ascending: false }).range(skip, skip + limit - 1);

    const { data: calls, count, error } = await query;
    if (error) throw new Error(error.message);

    res.status(200).json({
      message: 'Calls retrieved by date range successfully',
      data: calls.map(mapCallToFrontend),
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
        dateRange: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0]
        }
      },
      databaseMode: 'online'
    });
  } catch (error) {
    console.error('Error in getCallsByDateRange:', error);
    res.status(500).json({ 
      message: 'Error retrieving calls by date range', 
      error: error.message 
    });
  }
};

const getAuditorNames = async (req, res) => {
  try {
    if (process.env.DB_MODE === 'offline') {
      const callsLocal = getCallsFromLocalFile({});
      const names = Array.from(new Set(callsLocal.map(c => c.auditorName).filter(Boolean))).sort();
      return res.status(200).json({
        message: 'Auditor names retrieved successfully',
        data: names
      });
    }

    const { data, error } = await supabase
      .from('calls')
      .select('auditor_name')
      .not('auditor_name', 'is', null)
      .neq('auditor_name', '');

    if (error) {
      console.warn('⚠️ Supabase error checking auditor names (possibly column does not exist yet):', error.message);
      return res.status(200).json({
        message: 'Auditor names loaded gracefully (empty list)',
        data: []
      });
    }

    const names = Array.from(new Set(data.map(item => item.auditor_name))).sort();

    res.status(200).json({
      message: 'Auditor names retrieved successfully',
      data: names
    });
  } catch (error) {
    console.error('Error in getAuditorNames:', error);
    res.status(200).json({
      message: 'Error retrieving auditor names, falling back to empty list',
      data: []
    });
  }
};

const getProcesses = async (req, res) => {
  try {
    if (process.env.DB_MODE === 'offline') {
      const callsLocal = getCallsFromLocalFile({});
      const processes = Array.from(new Set(callsLocal.map(c => c.process).filter(Boolean))).sort();
      return res.status(200).json({
        message: 'Processes retrieved successfully',
        data: processes
      });
    }

    const { data, error } = await supabase
      .from('calls')
      .select('process')
      .not('process', 'is', null)
      .neq('process', '');

    if (error) {
      console.warn('⚠️ Supabase error checking processes:', error.message);
      return res.status(200).json({
        message: 'Processes loaded gracefully (empty list)',
        data: []
      });
    }

    const processes = Array.from(new Set(data.map(item => item.process))).sort();

    res.status(200).json({
      message: 'Processes retrieved successfully',
      data: processes
    });
  } catch (error) {
    console.error('Error in getProcesses:', error);
    res.status(200).json({
      message: 'Error retrieving processes, falling back to empty list',
      data: []
    });
  }
};

const getAuditorStats = async (req, res) => {
  try {
    const { dateFrom, dateTo, search, process } = req.query;

    if (process.env.DB_MODE === 'offline') {
      let callsLocal = getCallsFromLocalFile({ dateFrom, dateTo });
      callsLocal = callsLocal.filter(c => c.status === 'audited');

      if (search) {
        const searchVal = search.toLowerCase();
        callsLocal = callsLocal.filter(c => 
          (c.agentName && c.agentName.toLowerCase().includes(searchVal)) ||
          (c.callId && c.callId.toLowerCase().includes(searchVal)) ||
          (c.process && c.process.toLowerCase().includes(searchVal)) ||
          (c.agentEmail && c.agentEmail.toLowerCase().includes(searchVal))
        );
      }

      if (process) {
        const procVal = process.toLowerCase();
        callsLocal = callsLocal.filter(c => c.process && c.process.toLowerCase().includes(procVal));
      }

      // Perform grouping
      const counts = {};
      callsLocal.forEach(c => {
        const name = c.auditorName || 'Not Assigned';
        counts[name] = (counts[name] || 0) + 1;
      });

      const stats = Object.entries(counts).map(([auditorName, count]) => ({
        auditorName,
        count
      })).sort((a, b) => b.count - a.count);

      return res.status(200).json({
        message: 'Auditor stats retrieved successfully',
        data: stats
      });
    }

    // Supabase Online mode
    let query = supabase
      .from('calls')
      .select('auditor_name')
      .eq('status', 'audited')
      .eq('is_active', true);

    if (search) {
      const searchVal = `%${search}%`;
      query = query.or(`agent_name.ilike.${searchVal},call_id.ilike.${searchVal},process.ilike.${searchVal},agent_email.ilike.${searchVal}`);
    }

    if (process) {
      query = query.ilike('process', `%${process}%`);
    }

    if (dateFrom) {
      let fromDateStr = dateFrom;
      if (fromDateStr.length === 10) {
        fromDateStr = new Date(fromDateStr + 'T00:00:00+05:30').toISOString();
      }
      query = query.gte('date', fromDateStr);
    }
    if (dateTo) {
      let toDateStr = dateTo;
      if (toDateStr.length === 10) {
        toDateStr = new Date(toDateStr + 'T23:59:59.999+05:30').toISOString();
      }
      query = query.lte('date', toDateStr);
    }

    const { data: calls, error } = await query;
    if (error) throw new Error(error.message);

    const counts = {};
    calls.forEach(c => {
      const name = c.auditor_name || 'Not Assigned';
      counts[name] = (counts[name] || 0) + 1;
    });

    const stats = Object.entries(counts).map(([auditorName, count]) => ({
      auditorName,
      count
    })).sort((a, b) => b.count - a.count);

    res.status(200).json({
      message: 'Auditor stats retrieved successfully',
      data: stats
    });
  } catch (error) {
    console.error('Error in getAuditorStats:', error);
    res.status(500).json({ message: 'Error retrieving auditor stats', error: error.message });
  }
};

const parseExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an Excel or CSV file' });
    }

    const workbook = xlsx.readFile(req.file.path, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    const parsedRows = [];
    const seenIdsInBatch = new Set();

    for (const row of data) {
      try {
        const normalizedRow = {};
        Object.keys(row).forEach(key => {
          const normalizedKey = key.toLowerCase().trim().replace(/_/g, ' ').replace(/\s+/g, ' ');
          normalizedRow[normalizedKey] = row[key];
        });

        const rawCallId = 
          normalizedRow['call id'] || 
          normalizedRow['callid'] || 
          normalizedRow['id'] || 
          normalizedRow['s no'] || 
          normalizedRow['serial number'] || 
          normalizedRow['lead id'] ||
          Object.values(row)[0];

        let callId = String(rawCallId || '').trim();

        if (!callId) {
          callId = `GEN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        }

        let uniqueCallId = callId;
        let counter = 1;
        while (seenIdsInBatch.has(uniqueCallId)) {
          uniqueCallId = `${callId}_${counter}`;
          counter++;
        }
        seenIdsInBatch.add(uniqueCallId);

        const agentName = String(normalizedRow['agent full name'] || normalizedRow['agent name'] || normalizedRow['agent'] || normalizedRow['agentname'] || normalizedRow['staff'] || 'Unknown Agent').trim();
        const agentEmail = String(normalizedRow['agent email'] || normalizedRow['email'] || normalizedRow['agentemail'] || '').toLowerCase().trim();
        const processName = String(normalizedRow['process'] || normalizedRow['dept'] || normalizedRow['department'] || 'General').trim();
        
        let dateVal = normalizedRow['date'] || normalizedRow['date time'] || normalizedRow['date & time'] || normalizedRow['timestamp'] || normalizedRow['time'] || normalizedRow['date-time'];
        let finalDate = parseExcelDate(dateVal);

        const phoneNumber = String(normalizedRow['phone number'] || normalizedRow['phone'] || normalizedRow['customer number'] || normalizedRow['mobile'] || '').trim();
        
        const durationVal = normalizedRow['duration'] || normalizedRow['call duration'] || normalizedRow['call time'] || normalizedRow['length'] || '';
        const duration = formatExcelDuration(durationVal);

        const talktimeVal = normalizedRow['talktime'] || normalizedRow['talk time'] || '';
        const talktime = formatExcelDuration(talktimeVal);

        // Smart dispose: handle duplicate DISPOSE columns (XLSX renames 2nd to dispose_1 -> "dispose 1")
        let rawDisposeP = normalizedRow['dispose'] || '';
        const dispose1P = normalizedRow['dispose 1'] || '';
        const firstDisposeP = normalizedRow['first dispose'] || '';
        const isTimeValP = /^\d{1,2}:\d{2}(:\d{2})?$/.test(String(rawDisposeP).trim());
        const dispose = String(
          isTimeValP
            ? (dispose1P || firstDisposeP || normalizedRow['disposition'] || rawDisposeP)
            : (rawDisposeP || normalizedRow['disposition'] || '')
        ).trim();
        
        const remarks = String(normalizedRow['remarks'] || normalizedRow['comment'] || '').trim();
        const customerName = String(normalizedRow['customer name'] || normalizedRow['customer'] || '').trim();
        const recordingPath = String(normalizedRow['recording path'] || normalizedRow['audio link'] || normalizedRow['audio url'] || normalizedRow['recording link'] || '').trim();

        const insertData = {
          call_id: uniqueCallId,
          agent_name: agentName,
          agent_email: agentEmail,
          process: processName,
          date: finalDate.toISOString(),
          phone_number: phoneNumber,
          duration,
          talktime,
          dispose,
          remarks,
          customer_name: customerName,
          audio_url: recordingPath || ''
        };

        parsedRows.push(insertData);
      } catch (err) {
        // Skip row parsing errors gracefully
      }
    }

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    res.status(200).json({
      message: 'File parsed successfully',
      data: {
        total: parsedRows.length,
        rows: parsedRows
      }
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: 'Error parsing Excel file', error: error.message });
  }
};

const uploadChunk = async (req, res) => {
  try {
    const { calls } = req.body;
    if (!calls || !Array.isArray(calls)) {
      return res.status(400).json({ message: 'Please provide an array of calls' });
    }

    const results = { success: 0, skipped: 0, failed: 0, errors: [] };

    if (process.env.DB_MODE === 'offline') {
      const callsLocal = getCallsFromLocalFile({});
      const localIds = new Set(callsLocal.map(c => c.callId));
      
      const newCalls = [];
      for (const item of calls) {
        if (localIds.has(item.call_id)) {
          results.skipped++;
        } else {
          const callObj = {
            _id: 'call-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            callId: item.call_id,
            agentName: item.agent_name,
            agentEmail: item.agent_email,
            process: item.process,
            date: item.date,
            phoneNumber: item.phone_number,
            duration: item.duration,
            talktime: item.talktime,
            dispose: item.dispose,
            remarks: item.remarks,
            customerName: item.customer_name,
            audioUrl: item.audio_url || '',
            uploadedBy: req.userId,
            status: 'pending',
            isActive: true,
            createdAt: new Date().toISOString()
          };
          saveToLocalFile(callObj);
          newCalls.push(callObj);
          results.success++;
        }
      }
      return res.status(200).json({ data: results });
    }

    // Online Mode (Supabase)
    const callIds = calls.map(c => c.call_id);
    const { data: existing, error: existErr } = await supabase
      .from('calls')
      .select('call_id')
      .in('call_id', callIds);

    if (existErr) throw existErr;
    const existingSet = new Set((existing || []).map(row => row.call_id));

    const rowsToInsert = [];
    for (const item of calls) {
      if (existingSet.has(item.call_id)) {
        results.skipped++;
      } else {
        rowsToInsert.push({
          call_id: item.call_id,
          agent_name: item.agent_name,
          agent_email: item.agent_email,
          process: item.process,
          date: item.date,
          phone_number: item.phone_number,
          duration: item.duration,
          talktime: item.talktime,
          dispose: item.dispose,
          remarks: item.remarks,
          customer_name: item.customer_name,
          audio_url: item.audio_url || '',
          uploaded_by: req.userId,
          is_active: true
        });
      }
    }

    if (rowsToInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('calls')
        .insert(rowsToInsert);

      if (insertErr) {
        console.warn('⚠️ Chunk insertion failed. Falling back to row-by-row...', insertErr.message);
        for (const row of rowsToInsert) {
          try {
            const { error: rowErr } = await supabase
              .from('calls')
              .insert([row]);
            if (rowErr) throw rowErr;
            results.success++;
          } catch (singleErr) {
            results.failed++;
            results.errors.push(`Call ID ${row.call_id}: ${singleErr.message}`);
          }
        }
      } else {
        results.success += rowsToInsert.length;
      }
    }

    res.status(200).json({ data: results });
  } catch (error) {
    res.status(500).json({ message: 'Error uploading chunk', error: error.message });
  }
};

const proxyAudio = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ message: 'URL query parameter is required' });
    }

    const targetUrl = decodeURIComponent(url);
    
    // Add CORS headers so browser lets the audio tag play it
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    const https = require('https');
    const http = require('http');
    const clientModule = targetUrl.startsWith('https') ? https : http;

    // Forward range headers from client request for scrubbing/seeking support in player
    const requestOptions = {
      headers: {}
    };
    if (req.headers.range) {
      requestOptions.headers.range = req.headers.range;
    }

    clientModule.get(targetUrl, requestOptions, (targetRes) => {
      // Forward status code
      res.statusCode = targetRes.statusCode || 200;

      // Forward headers
      const headersToForward = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control'
      ];
      
      headersToForward.forEach(header => {
        if (targetRes.headers[header]) {
          res.setHeader(header, targetRes.headers[header]);
        }
      });
      
      // Pipe stream directly
      targetRes.pipe(res);
    }).on('error', (err) => {
      console.error('Audio proxy request error:', err);
      res.status(500).json({ message: 'Error streaming audio', error: err.message });
    });
  } catch (error) {
    console.error('Error in proxyAudio:', error);
    res.status(500).json({ message: 'Internal proxy error', error: error.message });
  }
};

module.exports = { 
  getAllCalls, 
  getCallById, 
  createCall, 
  getDashboardStats, 
  uploadCallData, 
  uploadAudio,
  deleteCalls,
  updateCallStatus,
  updateCall,
  getCallsByDateRange,
  getAuditorNames,
  getAuditorStats,
  parseExcel,
  uploadChunk,
  proxyAudio,
  getProcesses
};

