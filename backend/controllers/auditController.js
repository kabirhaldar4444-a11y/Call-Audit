const supabase = require('../config/supabase');

const mapAuditToFrontend = (audit) => {
  if (!audit) return null;
  return {
    _id: audit.id,
    callId: audit.calls ? {
      _id: audit.calls.id,
      callId: audit.calls.call_id,
      agentName: audit.calls.agent_name,
      agentEmail: audit.calls.agent_email,
      customerName: audit.calls.customer_name,
      process: audit.calls.process,
      date: audit.calls.date,
      phoneNumber: audit.calls.phone_number,
      duration: audit.calls.duration,
      remarks: audit.calls.remarks,
      audioUrl: audit.calls.audio_url,
      audioFilename: audit.calls.audio_filename,
      status: audit.calls.status,
      isActive: audit.calls.is_active,
    } : audit.call_id,
    auditorId: audit.users ? {
      id: audit.users.id,
      _id: audit.users.id,
      username: audit.users.username,
      email: audit.users.email,
    } : audit.auditor_id,
    scores: audit.scores,
    remarks: audit.remarks,
    overallScore: audit.overall_score,
    status: audit.status,
    createdAt: audit.created_at,
    updatedAt: audit.updated_at
  };
};

const submitAudit = async (req, res) => {
  try {
    const { callId, scores, remarks } = req.body;

    // Validate input
    if (!callId || !scores) {
      return res.status(400).json({ message: 'Please provide call ID and scores' });
    }

    // Check if call exists
    const { data: call, error: findCallErr } = await supabase
      .from('calls')
      .select('id')
      .eq('id', callId)
      .maybeSingle();

    if (findCallErr) throw findCallErr;
    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }

    // Calculate overall score
    const scoreValues = Object.values(scores).filter(v => v);
    const overallScore = scoreValues.length > 0 
      ? (scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length).toFixed(2)
      : 0;

    // Create audit record
    const { data: audit, error: auditError } = await supabase
      .from('audits')
      .insert([{
        call_id: callId,
        auditor_id: req.userId,
        scores,
        remarks,
        overall_score: parseFloat(overallScore),
        status: 'completed',
      }])
      .select()
      .single();

    if (auditError) throw auditError;

    // Update call status
    const { error: callUpdateErr } = await supabase
      .from('calls')
      .update({ status: 'audited' })
      .eq('id', callId);

    if (callUpdateErr) throw callUpdateErr;

    res.status(201).json({
      message: 'Audit submitted successfully',
      data: mapAuditToFrontend(audit),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error submitting audit', error: error.message });
  }
};

const getAuditByCallId = async (req, res) => {
  try {
    const { callId } = req.params;
    const { data: audit, error } = await supabase
      .from('audits')
      .select('*, calls(*), users(id, username, email)')
      .eq('call_id', callId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!audit) {
      return res.status(404).json({ message: 'Audit not found' });
    }

    res.status(200).json({
      message: 'Audit retrieved successfully',
      data: mapAuditToFrontend(audit),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving audit', error: error.message });
  }
};

const getAllAudits = async (req, res) => {
  try {
    const { data: audits, error } = await supabase
      .from('audits')
      .select('*, calls(*), users(id, username, email)')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    res.status(200).json({
      message: 'Audits retrieved successfully',
      data: audits.map(mapAuditToFrontend),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving audits', error: error.message });
  }
};

module.exports = { submitAudit, getAuditByCallId, getAllAudits };

