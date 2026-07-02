import React, { useState, useEffect, useRef, useMemo, useImperativeHandle } from 'react';
import api from '../utils/api';
import AudioPlayer from '../components/AudioPlayer';
import { AgGridReact } from 'ag-grid-react';
import { 
  FiSearch, 
  FiRefreshCw, 
  FiRotateCcw, 
  FiDownload, 
  FiColumns, 
  FiEye, 
  FiEdit2, 
  FiTrash2, 
  FiInbox,
  FiX,
  FiCheck
} from 'react-icons/fi';
import './Calls.css';

// Custom No Rows (Empty State) Component
const CustomNoRowsOverlay = () => {
  return (
    <div className="custom-no-rows-overlay">
      <div className="empty-state-icon">
        <FiInbox />
      </div>
      <h3>No Call Records Found</h3>
      <p>There are currently no call audit records matching your search or filters.</p>
      <p className="empty-subtitle">Try adjusting your filters, searching for something else, or uploading calls.</p>
    </div>
  );
};

// Custom Loading Component
const CustomLoadingOverlay = () => {
  return (
    <div className="custom-loading-overlay">
      <div className="loading-spinner"></div>
      <p>Loading audit records...</p>
    </div>
  );
};

const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getYesterdayDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const AuditorCellEditor = React.forwardRef((props, ref) => {
  const [value, setValue] = useState(props.value || '');
  const inputRef = useRef(null);
  const auditors = props.column.colDef.cellEditorParams?.auditors || [];

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  useImperativeHandle(ref, () => ({
    getValue() {
      return value.trim();
    },
    isCancelBeforeStart() {
      return false;
    },
    isCancelAfterEnd() {
      return false;
    }
  }));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      props.stopEditing();
    } else if (e.key === 'Escape') {
      props.stopEditing(true);
    }
  };

  return (
    <div className="custom-cell-editor-container">
      <input
        ref={inputRef}
        type="text"
        list="auditors-datalist"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="custom-grid-input"
        placeholder="Type or select auditor..."
      />
      <datalist id="auditors-datalist">
        {auditors.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
});

const Calls = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = user.role || 'user';
  const isSuperadmin = userRole === 'superadmin';
  const isAdmin = userRole === 'admin';
  const showEditButton = isAdmin || isSuperadmin;

  const gridRef = useRef(null);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [databaseMode, setDatabaseMode] = useState('online');
  const [auditorNames, setAuditorNames] = useState([]);
  const [processesList, setProcessesList] = useState([]);

  const todayStr = getTodayDateString();
  const yesterdayStr = getYesterdayDateString();

  // Filter states
  const [filters, setFilters] = useState({
    search: '',
    searchColumn: 'all',
    process: '',
    status: '',
    dateFrom: yesterdayStr,
    dateTo: todayStr
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  // Pagination metadata
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 1,
    limit: 25
  });

  // UI state toggles
  const [isColChooserOpen, setIsColChooserOpen] = useState(false);
  const [selectedAudio, setSelectedAudio] = useState(null);

  // Modals state
  const [viewingCall, setViewingCall] = useState(null);
  const [editingCall, setEditingCall] = useState(null);
  const [editFormData, setEditFormData] = useState({
    agentName: '',
    process: '',
    status: '',
    duration: '',
    talktime: '',
    dispose: '',
    auditorName: ''
  });
  const [deletingCall, setDeletingCall] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingCallActive, setDeletingCallActive] = useState(false);
  
  // Custom New Auditor Modal State
  const [newAuditorModalOpen, setNewAuditorModalOpen] = useState(false);
  const [newAuditorNameInput, setNewAuditorNameInput] = useState('');
  const [pendingAuditorUpdate, setPendingAuditorUpdate] = useState(null);

  // Column Visibility State
  const [columnVisibility, setColumnVisibility] = useState({
    slNo: true,
    listen: true,
    callId: true,
    agentName: true,
    process: true,
    date: true,
    duration: true,
    talktime: true,
    dispose: true,
    agentEmail: true,
    auditorName: true,
    status: true,
    action: true
  });

  // List of column checkboxes in Column Chooser
  const columnOptions = [
    { id: 'slNo', name: 'SL No' },
    { id: 'listen', name: 'Listen' },
    { id: 'callId', name: 'Call ID' },
    { id: 'agentName', name: 'Agent' },
    { id: 'process', name: 'Process' },
    { id: 'date', name: 'Date & Time' },
    { id: 'duration', name: 'Duration' },
    { id: 'talktime', name: 'Talktime' },
    { id: 'dispose', name: 'Dispose' },
    { id: 'agentEmail', name: 'Agent Email' },
    { id: 'auditorName', name: 'Auditor Name' },
    { id: 'status', name: 'Status' },
    { id: 'action', name: 'Action' }
  ];

  const fetchAuditorNames = async () => {
    try {
      const res = await api.get('/calls/auditors');
      setAuditorNames(res.data.data || []);
    } catch (error) {
      console.error('Error fetching auditor names:', error);
    }
  };

  const fetchProcesses = async () => {
    try {
      const res = await api.get('/calls/processes');
      setProcessesList(res.data.data || []);
    } catch (error) {
      console.error('Error fetching processes:', error);
    }
  };

  useEffect(() => {
    fetchAuditorNames();
    fetchProcesses();
  }, []);

  const fetchCalls = async () => {
    try {
      setLoading(true);
      // Send raw YYYY-MM-DD strings; the backend handles timezone conversion
      const dateFromParam = appliedFilters.dateFrom;
      const dateToParam = appliedFilters.dateTo;

      const queryParams = new URLSearchParams({
        page,
        limit: pageSize || 25,
        process: appliedFilters.process,
        status: appliedFilters.status,
        dateFrom: dateFromParam,
        dateTo: dateToParam
      });

      if (appliedFilters.search) {
        if (appliedFilters.searchColumn === 'all') {
          queryParams.append('search', appliedFilters.search);
        } else {
          queryParams.append(appliedFilters.searchColumn, appliedFilters.search);
        }
      }

      const response = await api.get(`/calls?${queryParams.toString()}`);
      setCalls(response.data.data || []);
      setPagination(response.data.pagination || { total: 0, totalPages: 1, limit: pageSize || 25 });
      setDatabaseMode(response.data.databaseMode || 'online');
      fetchProcesses();
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, [page, pageSize, appliedFilters]);

  // No uniqueProcesses useMemo necessary since we fetch all processes dynamically from database

  const resetFilters = () => {
    const defaultFilters = {
      search: '',
      searchColumn: 'all',
      process: '',
      status: '',
      dateFrom: yesterdayStr,
      dateTo: todayStr
    };
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  };

  const handleSearchClick = () => {
    setAppliedFilters(filters);
    setPage(1);
  };

  const handleCellValueChanged = async (event) => {
    const { data, colDef, newValue, oldValue } = event;
    if (newValue === oldValue || (newValue === '' && !oldValue)) return;
    
    const targetId = data._id || data.id;
    try {
      const payload = {
        agentName: data.agentName,
        process: data.process,
        duration: data.duration,
        status: data.status,
        auditorName: data.auditorName
      };
      
      await api.patch(`/calls/${targetId}`, payload);
      
      if (colDef.field === 'auditorName') {
        fetchAuditorNames();
      }
      
      fetchCalls();
    } catch (error) {
      console.error('Error updating call field:', error);
      alert('Failed to save changes. Please try again.');
      fetchCalls();
    }
  };

  const exportCSV = () => {
    if (gridRef.current && gridRef.current.api) {
      gridRef.current.api.exportDataAsCsv({
        fileName: `Call_Records_${new Date().toISOString().split('T')[0]}.csv`,
        allColumns: true
      });
    }
  };

  const toggleColumn = (colId) => {
    setColumnVisibility(prev => ({
      ...prev,
      [colId]: !prev[colId]
    }));
  };

  // Helper date getters
  const getToday = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const getLast30Days = () => {
    const today = new Date();
    const last30 = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    return last30.toISOString().split('T')[0];
  };

  // Grid API & layout config
  const domLayout = useMemo(() => {
    return calls.length <= 10 ? 'autoHeight' : 'normal';
  }, [calls]);

  // Modal actions handlers
  const handleViewCall = (call) => {
    setViewingCall(call);
  };

  const handleEditCall = (call) => {
    setEditingCall(call);
    setEditFormData({
      agentName: call.agentName || '',
      process: call.process || '',
      status: call.status || 'pending',
      duration: call.duration || '',
      talktime: call.talktime || '',
      dispose: call.dispose || '',
      auditorName: call.auditorName || ''
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingCall) return;

    try {
      setSavingEdit(true);
      const targetId = editingCall._id || editingCall.id;
      await api.patch(`/calls/${targetId}`, {
        agentName: editFormData.agentName,
        process: editFormData.process,
        status: editFormData.status,
        duration: editFormData.duration,
        talktime: editFormData.talktime,
        dispose: editFormData.dispose,
        auditorName: editFormData.auditorName
      });
      
      fetchAuditorNames();
      await fetchCalls();
      setEditingCall(null);
    } catch (error) {
      console.error('Error saving call edits:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteClick = (call) => {
    setDeletingCall(call);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCall) return;

    try {
      setDeletingCallActive(true);
      const targetId = deletingCall._id || deletingCall.id;
      await api.post('/calls/delete', { ids: [targetId] });
      
      // Refresh current page
      await fetchCalls();
      setDeletingCall(null);
    } catch (error) {
      console.error('Error deleting call:', error);
      alert('Failed to delete call record.');
    } finally {
      setDeletingCallActive(false);
    }
  };

  const handleDeleteByDateRange = async () => {
    if (!filters.dateFrom || !filters.dateTo) {
      alert('Please select both From and To dates to delete data by date.');
      return;
    }
    if (!window.confirm(`⚠️ WARNING: Are you sure you want to permanently delete ALL calls from ${filters.dateFrom} to ${filters.dateTo}? This action is irreversible!`)) {
      return;
    }
    try {
      setLoading(true);
      await api.post('/calls/delete', { dateFrom: filters.dateFrom, dateTo: filters.dateTo });
      alert('Calls in selected date range deleted successfully.');
      fetchCalls();
    } catch (error) {
      console.error('Error deleting calls by date range:', error);
      alert('Failed to delete calls. Please check permissions.');
    } finally {
      setLoading(false);
    }
  };

  // AG Grid columns list
  const columnDefs = useMemo(() => [
    { 
      headerName: "SL NO", 
      field: "slNo",
      valueGetter: (params) => params.node.rowIndex + 1 + ((page - 1) * pageSize), 
      width: 70, 
      maxWidth: 90,
      sortable: false, 
      filter: false,
      pinned: 'left',
      hide: !columnVisibility.slNo
    },
    { 
      headerName: "Listen", 
      field: "audioUrl",
      sortable: false, 
      filter: false,
      width: 90,
      maxWidth: 100,
      pinned: 'left',
      cellRenderer: (params) => {
        const call = params.data;
        if (!call || !call.audioUrl) {
          return <span className="no-audio">No Audio</span>;
        }
        return (
          <button
            className="action-icon-btn listen-row-btn"
            onClick={() => {
              setSelectedAudio({ url: call.audioUrl, call });
            }}
            title="Listen to Recording"
            style={{
              background: 'rgba(6, 182, 212, 0.15)',
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(6, 182, 212, 0.25)',
              padding: '4px 10px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '11px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '32px'
            }}
          >
            🔊 Play
          </button>
        );
      },
      hide: !columnVisibility.listen
    },
    { 
      field: "callId", 
      headerName: "Call ID", 
      filter: 'agTextColumnFilter',
      sortable: true,
      minWidth: 120,
      cellRenderer: (params) => <strong className="bold">{params.value}</strong>,
      hide: !columnVisibility.callId
    },
    { 
      field: "agentName", 
      headerName: "Agent", 
      filter: 'agTextColumnFilter',
      sortable: true,
      minWidth: 130,
      editable: () => showEditButton,
      hide: !columnVisibility.agentName
    },
    { 
      field: "process", 
      headerName: "Process", 
      filter: 'agTextColumnFilter',
      sortable: true,
      minWidth: 110,
      editable: () => showEditButton,
      hide: !columnVisibility.process
    },
    { 
      field: "date", 
      headerName: "Date & Time", 
      filter: 'agDateColumnFilter',
      sortable: true,
      minWidth: 160,
      cellRenderer: (params) => params.value ? new Date(params.value).toLocaleString() : '',
      hide: !columnVisibility.date
    },
    { 
      field: "duration", 
      headerName: "Duration", 
      filter: 'agTextColumnFilter',
      sortable: true,
      width: 100,
      maxWidth: 120,
      editable: () => showEditButton,
      hide: !columnVisibility.duration
    },
    { 
      field: "talktime", 
      headerName: "Talktime", 
      filter: 'agTextColumnFilter',
      sortable: true,
      minWidth: 100,
      editable: () => showEditButton,
      hide: !columnVisibility.talktime
    },
    { 
      field: "dispose", 
      headerName: "Dispose", 
      filter: 'agTextColumnFilter',
      sortable: true,
      minWidth: 120,
      editable: () => showEditButton,
      hide: !columnVisibility.dispose
    },
    { 
      field: "agentEmail", 
      headerName: "Agent Email", 
      filter: 'agTextColumnFilter',
      sortable: true,
      minWidth: 180,
      cellRenderer: (params) => {
        const val = params.value || '';
        return (
          <span className="email-cell" title={val}>
            {val}
          </span>
        );
      },
      hide: !columnVisibility.agentEmail
    },
    { 
      field: "auditorName", 
      headerName: "Auditor Name", 
      filter: 'agTextColumnFilter',
      sortable: true,
      minWidth: 180,
      editable: false,
      cellRenderer: (params) => {
        const val = params.value || '';
        return (
          <select
            value={val}
            onChange={async (e) => {
              let selectedName = e.target.value;
              if (selectedName === '__ADD_NEW__') {
                const targetId = params.data._id || params.data.id;
                setPendingAuditorUpdate({
                  callId: targetId,
                  node: params.node,
                  selectElement: e.target,
                  oldValue: val
                });
                setNewAuditorNameInput('');
                setNewAuditorModalOpen(true);
                return;
              }

              const targetId = params.data._id || params.data.id;
              try {
                await api.patch(`/calls/${targetId}`, {
                  agentName: params.data.agentName,
                  process: params.data.process,
                  duration: params.data.duration,
                  status: params.data.status,
                  auditorName: selectedName
                });
                params.node.setDataValue('auditorName', selectedName);
                fetchAuditorNames();
                fetchCalls();
              } catch (err) {
                console.error('Error updating auditor:', err);
                alert('Failed to update auditor name.');
              }
            }}
            className="grid-inline-select auditor-dropdown"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-primary)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '12px',
              outline: 'none',
              width: '100%',
              height: '32px'
            }}
          >
            <option value="">👤 Select Auditor...</option>
            {auditorNames.map(name => (
              <option key={name} value={name} style={{ background: '#1e1b4b', color: 'white' }}>
                {name}
              </option>
            ))}
            <option value="__ADD_NEW__" style={{ background: '#1e1b4b', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>
              ➕ Add New Auditor...
            </option>
          </select>
        );
      },
      hide: !columnVisibility.auditorName
    },
    { 
      field: "status", 
      headerName: "Status", 
      filter: 'agTextColumnFilter',
      sortable: true,
      width: 130,
      editable: false,
      cellRenderer: (params) => {
        const val = params.value || 'pending';
        return (
          <select
            value={val}
            onChange={async (e) => {
              const newStatus = e.target.value;
              const targetId = params.data._id || params.data.id;
              try {
                await api.patch(`/calls/${targetId}`, {
                  agentName: params.data.agentName,
                  process: params.data.process,
                  duration: params.data.duration,
                  status: newStatus,
                  auditorName: params.data.auditorName
                });
                params.node.setDataValue('status', newStatus);
                fetchCalls();
              } catch (err) {
                console.error('Error updating status:', err);
                alert('Failed to update status.');
              }
            }}
            className="grid-inline-select status-dropdown"
            style={{
              background: val === 'audited' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: val === 'audited' ? 'var(--accent-green)' : 'var(--accent-orange)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              padding: '4px 8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '12px',
              outline: 'none',
              width: '100%',
              height: '32px'
            }}
          >
            <option value="pending" style={{ background: '#1e1b4b', color: 'white' }}>Pending</option>
            <option value="audited" style={{ background: '#1e1b4b', color: 'white' }}>Audited</option>
          </select>
        );
      },
      hide: !columnVisibility.status
    },
    { 
      headerName: "Action", 
      field: "action",
      sortable: false, 
      filter: false,
      minWidth: 185,
      pinned: 'right',
      cellRenderer: (params) => {
        const call = params.data;
        if (!call) return null;
        return (
          <div className="action-buttons-cell">
            <button
              className="action-icon-btn view"
              onClick={() => handleViewCall(call)}
              title="View Call Details"
            >
              <FiEye className="icon" />
              <span className="btn-text">View</span>
            </button>
            {showEditButton && (
              <button
                className="action-icon-btn edit"
                onClick={() => handleEditCall(call)}
                title="Edit Call Details"
              >
                <FiEdit2 className="icon" />
                <span className="btn-text">Edit</span>
              </button>
            )}
            {isSuperadmin && (
              <button
                className="action-icon-btn delete"
                onClick={() => handleDeleteClick(call)}
                title="Delete Record"
              >
                <FiTrash2 className="icon" />
                <span className="btn-text">Delete</span>
              </button>
            )}
          </div>
        );
      },
      hide: !columnVisibility.action
    }
  ], [page, pageSize, columnVisibility, auditorNames, showEditButton, isSuperadmin]);

  return (
    <div className="calls-container">
      <div className="calls-header">
        <div>
          <h2>Call Audit Panel</h2>
          <p>Browse, search, edit, and audit call records</p>
          {databaseMode === 'offline' && (
            <div className="database-offline-badge">
              ⚠️ Local offline fallback mode active
            </div>
          )}
        </div>
      </div>

      <div className="records-section">
        {/* Modern Filter & Search Toolbar */}
        <div className="calls-toolbar">
          <div className="toolbar-left-group">
            <select 
              value={filters.searchColumn} 
              onChange={(e) => setFilters(prev => ({ ...prev, searchColumn: e.target.value }))}
              className="toolbar-select search-column-select"
              title="Select column to search by"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: 'var(--text-primary)',
                padding: '10px 16px',
                fontSize: '14px',
                cursor: 'pointer',
                outline: 'none',
                maxWidth: '150px'
              }}
            >
              <option value="all" style={{ background: '#1e1b4b', color: 'white' }}>🔍 All Columns</option>
              <option value="callId" style={{ background: '#1e1b4b', color: 'white' }}>Call ID</option>
              <option value="agentName" style={{ background: '#1e1b4b', color: 'white' }}>Agent Name</option>
              <option value="process" style={{ background: '#1e1b4b', color: 'white' }}>Process</option>
              <option value="agentEmail" style={{ background: '#1e1b4b', color: 'white' }}>Agent Email</option>
              <option value="auditorName" style={{ background: '#1e1b4b', color: 'white' }}>Auditor Name</option>
              <option value="duration" style={{ background: '#1e1b4b', color: 'white' }}>Duration</option>
              <option value="talktime" style={{ background: '#1e1b4b', color: 'white' }}>Talktime</option>
              <option value="dispose" style={{ background: '#1e1b4b', color: 'white' }}>Dispose</option>
            </select>

            <div className="search-box">
              <FiSearch className="search-icon" />
              <input 
                type="text" 
                placeholder="Search Calls..." 
                value={filters.search} 
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="toolbar-input"
              />
            </div>
            
            <select 
              value={filters.process} 
              onChange={(e) => {
                const newProcess = e.target.value;
                setFilters(prev => ({ ...prev, process: newProcess }));
                setAppliedFilters(prev => ({ ...prev, process: newProcess }));
                setPage(1);
              }}
              className="toolbar-select"
            >
              <option value="">All Processes</option>
              {processesList.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            <select 
              value={filters.status} 
              onChange={(e) => {
                const newStatus = e.target.value;
                setFilters(prev => ({ ...prev, status: newStatus }));
                setAppliedFilters(prev => ({ ...prev, status: newStatus }));
                setPage(1);
              }}
              className="toolbar-select"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="audited">Audited</option>
            </select>

            <div className="date-range-picker">
              <input 
                type="date" 
                value={filters.dateFrom} 
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                max={filters.dateTo || todayStr}
                className="toolbar-date-input"
                title="From Date"
              />
              <span className="date-separator">to</span>
              <input 
                type="date" 
                value={filters.dateTo} 
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                min={filters.dateFrom}
                max={todayStr}
                className="toolbar-date-input"
                title="To Date"
              />
              <button 
                onClick={handleSearchClick}
                className="toolbar-btn text-btn search-submit-btn"
                title="Apply date and filter search"
                style={{ marginLeft: '4px' }}
              >
                <FiSearch className="btn-icon" /> Search
              </button>
              {isSuperadmin && (
                <button 
                  onClick={handleDeleteByDateRange}
                  className="toolbar-btn text-btn outline-btn range-delete-btn"
                  title="Delete all calls in selected date range"
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#fca5a5',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '12px',
                    marginLeft: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '38px',
                    transition: 'all 0.3s ease'
                  }}
                >
                  🗑️ Delete Date Range
                </button>
              )}
            </div>
          </div>

          <div className="toolbar-right-group">
            <div className="action-buttons">
              <button 
                onClick={() => {
                  const newFrom = getLast30Days();
                  const newTo = getToday();
                  setFilters(prev => ({ ...prev, dateFrom: newFrom, dateTo: newTo }));
                  setAppliedFilters(prev => ({ ...prev, dateFrom: newFrom, dateTo: newTo }));
                  setPage(1);
                }}
                className="toolbar-btn text-btn outline-btn"
                title="Filter last 30 days"
              >
                Last 30 Days
              </button>
              <button onClick={fetchCalls} className="toolbar-btn icon-btn" title="Refresh Table">
                <FiRefreshCw />
              </button>
              <button onClick={resetFilters} className="toolbar-btn icon-btn" title="Reset Filters">
                <FiRotateCcw />
              </button>
              <button onClick={exportCSV} className="toolbar-btn text-btn outline-btn" title="Export as CSV">
                <FiDownload className="btn-icon" /> CSV
              </button>
              
              {/* Column Chooser */}
              <div className="column-chooser-wrapper">
                <button 
                  onClick={() => setIsColChooserOpen(!isColChooserOpen)} 
                  className={`toolbar-btn text-btn outline-btn ${isColChooserOpen ? 'active' : ''}`}
                  title="Choose Columns"
                >
                  <FiColumns className="btn-icon" /> Columns
                </button>
                {isColChooserOpen && (
                  <>
                    <div className="col-chooser-backdrop" onClick={() => setIsColChooserOpen(false)} />
                    <div className="column-chooser-dropdown">
                      <h4>Visible Columns</h4>
                      <div className="col-chooser-list">
                        {columnOptions.map(col => (
                          <label key={col.id} className="col-chooser-label">
                            <input 
                              type="checkbox" 
                              checked={columnVisibility[col.id]} 
                              onChange={() => toggleColumn(col.id)}
                            />
                            <span>{col.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="records-count-indicator">
              <span className="count-label">Total: <strong>{pagination.total}</strong></span>
              {pagination.total > 0 && (
                <span className="count-showing">
                  Showing <strong>{Math.min(pagination.total, (page - 1) * pageSize + 1)}</strong>-
                  <strong>{Math.min(pagination.total, page * pageSize)}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Table & Overlays container */}
        <div className="table-wrapper">
          <div 
            className="calls-table ag-theme-alpine" 
            style={{ 
              height: domLayout === 'normal' ? '550px' : 'auto', 
              width: '100%' 
            }}
          >
            <AgGridReact
              ref={gridRef}
              rowData={calls}
              columnDefs={columnDefs}
              rowHeight={50}
              domLayout={domLayout}
              onCellValueChanged={handleCellValueChanged}
              singleClickEdit={true}
              defaultColDef={{
                resizable: true,
                flex: 1,
                minWidth: 100,
                floatingFilter: true,
                suppressHeaderMenuButton: false
              }}
              loadingOverlayComponent={CustomLoadingOverlay}
              noRowsOverlayComponent={CustomNoRowsOverlay}
            />
          </div>
        </div>

        {/* Custom pagination layout at the bottom */}
        {pagination.totalPages > 1 && (
          <div className="pagination-wrapper">
            <div className="page-size-selector">
              <label>Rows per page:</label>
              <input 
                type="number"
                min="1"
                max="5000"
                value={pageSize}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (val > 0) {
                    setPageSize(val);
                    setPage(1);
                  } else if (e.target.value === '') {
                    setPageSize('');
                  }
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (!val || val <= 0) {
                    setPageSize(25);
                  }
                }}
                className="page-size-input"
                style={{
                  width: '75px',
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  outline: 'none',
                  fontSize: '13px',
                  fontWeight: '600',
                  textAlign: 'center',
                  marginLeft: '8px'
                }}
              />
            </div>

            <div className="pagination-controls">
              <button 
                disabled={page === 1 || loading} 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="pagination-nav-btn"
              >
                Previous
              </button>
              
              <div className="pagination-pages">
                {(() => {
                  const pages = [];
                  const maxVisible = 5;
                  let start = Math.max(1, page - 2);
                  let end = Math.min(pagination.totalPages, start + maxVisible - 1);
                  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

                  for (let i = start; i <= end; i++) {
                    pages.push(
                      <button 
                        key={i} 
                        onClick={() => setPage(i)}
                        className={`pagination-page-btn ${page === i ? 'active' : ''}`}
                        disabled={loading}
                      >
                        {i}
                      </button>
                    );
                  }
                  return pages;
                })()}
              </div>

              <button 
                disabled={page === pagination.totalPages || loading} 
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                className="pagination-nav-btn"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* VIEW DETAILS MODAL */}
      {viewingCall && (
        <div className="glass-modal-overlay">
          <div className="glass-modal-card width-large">
            <div className="glass-modal-header">
              <h3>Call details : {viewingCall.callId}</h3>
              <button onClick={() => setViewingCall(null)} className="close-modal-btn">
                <FiX />
              </button>
            </div>
            <div className="glass-modal-body info-grid">
              <div className="info-item">
                <span className="info-label">Call ID</span>
                <span className="info-value font-highlight">{viewingCall.callId}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Agent Name</span>
                <span className="info-value">{viewingCall.agentName || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Agent Email</span>
                <span className="info-value">{viewingCall.agentEmail || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Process</span>
                <span className="info-value">{viewingCall.process || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Customer Name</span>
                <span className="info-value">{viewingCall.customerName || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Phone Number</span>
                <span className="info-value">{viewingCall.phoneNumber || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Duration</span>
                <span className="info-value font-highlight">{viewingCall.duration || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Talktime</span>
                <span className="info-value font-highlight">{viewingCall.talktime || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Dispose</span>
                <span className="info-value">{viewingCall.dispose || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Date & Time</span>
                <span className="info-value">{viewingCall.date ? new Date(viewingCall.date).toLocaleString() : 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Status</span>
                <span className={`status-pill ${viewingCall.status}`}>
                  • {viewingCall.status ? viewingCall.status.toUpperCase() : 'PENDING'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Auditor Name</span>
                <span className="info-value font-highlight">{viewingCall.auditorName || 'N/A'}</span>
              </div>
              <div className="info-item full-width">
                <span className="info-label">Audio File</span>
                <span className="info-value">
                  {viewingCall.audioUrl ? (
                    <button 
                      onClick={() => {
                        setSelectedAudio({ url: viewingCall.audioUrl, call: viewingCall });
                        setViewingCall(null);
                      }}
                      className="inline-listen-btn"
                    >
                      🔊 Listen to audio recording
                    </button>
                  ) : 'No recording uploaded'}
                </span>
              </div>
              {viewingCall.remarks && (
                <div className="info-item full-width">
                  <span className="info-label">Remarks / Audit Notes</span>
                  <span className="info-value notes-block">{viewingCall.remarks}</span>
                </div>
              )}
            </div>
            <div className="glass-modal-footer">
              <button onClick={() => setViewingCall(null)} className="modal-btn secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingCall && (
        <div className="glass-modal-overlay">
          <form onSubmit={handleSaveEdit} className="glass-modal-card">
            <div className="glass-modal-header">
              <h3>Edit Call Record</h3>
              <button type="button" onClick={() => setEditingCall(null)} className="close-modal-btn">
                <FiX />
              </button>
            </div>
            <div className="glass-modal-body form-list">
              <div className="form-group">
                <label>Agent Name</label>
                <input 
                  type="text" 
                  value={editFormData.agentName}
                  onChange={(e) => setEditFormData({...editFormData, agentName: e.target.value})}
                  required
                  className="modal-form-input"
                />
              </div>
              <div className="form-group">
                <label>Process</label>
                <input 
                  type="text" 
                  value={editFormData.process}
                  onChange={(e) => setEditFormData({...editFormData, process: e.target.value})}
                  required
                  className="modal-form-input"
                />
              </div>
              <div className="form-group">
                <label>Duration</label>
                <input 
                  type="text" 
                  value={editFormData.duration}
                  onChange={(e) => setEditFormData({...editFormData, duration: e.target.value})}
                  required
                  placeholder="e.g. 05:23"
                  className="modal-form-input"
                />
              </div>
              <div className="form-group">
                <label>Talktime</label>
                <input 
                  type="text" 
                  value={editFormData.talktime}
                  onChange={(e) => setEditFormData({...editFormData, talktime: e.target.value})}
                  placeholder="e.g. 04:12"
                  className="modal-form-input"
                />
              </div>
              <div className="form-group">
                <label>Dispose</label>
                <input 
                  type="text" 
                  value={editFormData.dispose}
                  onChange={(e) => setEditFormData({...editFormData, dispose: e.target.value})}
                  placeholder="e.g. Completed"
                  className="modal-form-input"
                />
              </div>
              <div className="form-group">
                <label>Auditor Name</label>
                <input 
                  type="text" 
                  value={editFormData.auditorName}
                  onChange={(e) => setEditFormData({...editFormData, auditorName: e.target.value})}
                  className="modal-form-input"
                  placeholder="Type auditor name"
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select 
                  value={editFormData.status}
                  onChange={(e) => setEditFormData({...editFormData, status: e.target.value})}
                  className="modal-form-select"
                >
                  <option value="pending">Pending</option>
                  <option value="audited">Audited</option>
                </select>
              </div>
            </div>
            <div className="glass-modal-footer">
              <button type="button" onClick={() => setEditingCall(null)} className="modal-btn secondary" disabled={savingEdit}>Cancel</button>
              <button type="submit" className="modal-btn primary" disabled={savingEdit}>
                {savingEdit ? 'Saving...' : <><FiCheck className="btn-icon" /> Save Changes</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingCall && (
        <div className="glass-modal-overlay">
          <div className="glass-modal-card">
            <div className="glass-modal-header danger">
              <h3>Delete Call Record</h3>
              <button onClick={() => setDeletingCall(null)} className="close-modal-btn">
                <FiX />
              </button>
            </div>
            <div className="glass-modal-body">
              <p>Are you sure you want to permanently delete call record <strong>{deletingCall.callId}</strong>?</p>
              <p className="danger-subtitle">⚠️ This action is irreversible and will delete this record from Supabase database.</p>
            </div>
            <div className="glass-modal-footer">
              <button onClick={() => setDeletingCall(null)} className="modal-btn secondary" disabled={deletingCallActive}>Cancel</button>
              <button onClick={handleConfirmDelete} className="modal-btn danger-btn" disabled={deletingCallActive}>
                {deletingCallActive ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD NEW AUDITOR MODAL */}
      {newAuditorModalOpen && (
        <div className="glass-modal-overlay">
          <div className="glass-modal-card">
            <div className="glass-modal-header">
              <h3>Add New Auditor</h3>
              <button 
                type="button" 
                onClick={() => {
                  if (pendingAuditorUpdate?.selectElement) {
                    pendingAuditorUpdate.selectElement.value = pendingAuditorUpdate.oldValue;
                  }
                  setNewAuditorModalOpen(false);
                }} 
                className="close-modal-btn"
              >
                <FiX />
              </button>
            </div>
            <div className="glass-modal-body form-list">
              <div className="form-group">
                <label>Auditor Name</label>
                <input 
                  type="text" 
                  value={newAuditorNameInput}
                  onChange={(e) => setNewAuditorNameInput(e.target.value)}
                  className="modal-form-input"
                  placeholder="Enter auditor name..."
                  autoFocus
                  required
                />
              </div>
            </div>
            <div className="glass-modal-footer">
              <button 
                type="button" 
                onClick={() => {
                  if (pendingAuditorUpdate?.selectElement) {
                    pendingAuditorUpdate.selectElement.value = pendingAuditorUpdate.oldValue;
                  }
                  setNewAuditorModalOpen(false);
                }} 
                className="modal-btn secondary"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={async () => {
                  const newName = newAuditorNameInput.trim();
                  if (!newName) {
                    alert('Please enter a valid name.');
                    return;
                  }
                  
                  const targetId = pendingAuditorUpdate.callId;
                  try {
                    await api.patch(`/calls/${targetId}`, {
                      agentName: pendingAuditorUpdate.node.data.agentName,
                      process: pendingAuditorUpdate.node.data.process,
                      duration: pendingAuditorUpdate.node.data.duration,
                      status: pendingAuditorUpdate.node.data.status,
                      auditorName: newName
                    });
                    pendingAuditorUpdate.node.setDataValue('auditorName', newName);
                    fetchAuditorNames();
                    fetchCalls();
                    if (typeof window.fetchAuditorStats === 'function') {
                      window.fetchAuditorStats();
                    }
                    setNewAuditorModalOpen(false);
                  } catch (err) {
                    console.error('Error saving new auditor:', err);
                    alert('Failed to update auditor name.');
                    if (pendingAuditorUpdate?.selectElement) {
                      pendingAuditorUpdate.selectElement.value = pendingAuditorUpdate.oldValue;
                    }
                  }
                }}
                className="modal-btn primary"
              >
                <FiCheck className="btn-icon" /> Save Auditor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Audio Player */}
      {selectedAudio && (
        <AudioPlayer 
          audioUrl={selectedAudio.url} 
          callInfo={selectedAudio.call}
          onClose={() => setSelectedAudio(null)} 
        />
      )}
    </div>
  );
};

export default Calls;
