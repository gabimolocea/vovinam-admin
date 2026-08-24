import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient, { competitionAPI, diplomaTemplateAPI } from '@shared/lib/api';
import { Card, Spinner } from '@shared/components/ui';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  createDiplomaPlacement,
  DIPLOMA_CATEGORY_SCOPE_OPTIONS,
  DIPLOMA_TEMPLATE_OPTIONS,
  getAvailableDiplomaFields,
  getDiplomaCategoryScopeLabel,
  getDiplomaFieldBinding,
  getDiplomaFieldToken,
  getDiplomaPayloadExample,
  getDiplomaTemplateLabel,
} from '../lib/diplomas';

function getRatio(orientation) {
  return orientation === 'portrait' ? '0.707 / 1' : '1.414 / 1';
}

function getPdfFileName(pdfUrl) {
  if (!pdfUrl) return '—';
  try {
    const withoutHash = String(pdfUrl).split('#')[0];
    const withoutQuery = withoutHash.split('?')[0];
    const segments = withoutQuery.split('/').filter(Boolean);
    return decodeURIComponent(segments[segments.length - 1] || '—');
  } catch {
    return '—';
  }
}

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export default function DiplomaConfiguratorPage() {
  const { id: eventId } = useParams();
  const previewRef = useRef(null);
  const dragRef = useRef(null);
  const pdfCanvasRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);
  const lastAutoSaveSignatureRef = useRef('');
  const [pdfRenderError, setPdfRenderError] = useState('');
  const [showBleed, setShowBleed] = useState(true);
  const [showTrim, setShowTrim] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventName, setEventName] = useState('');
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(true);
  const [selectedPaletteField, setSelectedPaletteField] = useState(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState(null);
  const [replacementPdfFile, setReplacementPdfFile] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [message, setMessage] = useState('');
  const [uploadForm, setUploadForm] = useState({
    title: '',
    template_kind: 'first_place',
    category_scope: 'all',
    preview_orientation: 'landscape',
    pdf_file: null,
  });

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId) || null,
    [templates, selectedId],
  );

  const availableFields = useMemo(
    () => getAvailableDiplomaFields(selectedTemplate?.category_scope || 'all'),
    [selectedTemplate?.category_scope],
  );

  const selectedPlacement = useMemo(
    () => selectedTemplate?.placements?.find((placement) => placement.id === selectedPlacementId) || null,
    [selectedTemplate, selectedPlacementId],
  );

  const payloadExample = useMemo(
    () => getDiplomaPayloadExample(selectedTemplate?.category_scope || 'solo'),
    [selectedTemplate?.category_scope],
  );

  const loadData = async () => {
    const [compRes, templatesRes] = await Promise.all([
      competitionAPI.get(eventId),
      diplomaTemplateAPI.list({ event: eventId }),
    ]);
    setEventName(compRes.data?.name || `Competiția #${eventId}`);
    const list = Array.isArray(templatesRes.data) ? templatesRes.data : [];
    setTemplates(list.map((item) => ({ ...item, placements: Array.isArray(item.placements) ? item.placements : [] })));
    if (!list.length) {
      setSelectedId(null);
      setShowTemplatePicker(true);
      return;
    }
    setSelectedId((current) => current ?? null);
    setShowTemplatePicker((current) => current || !selectedId);
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    setReplacementPdfFile(null);
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;

    const renderPdfPreview = async () => {
      const canvas = pdfCanvasRef.current;
      if (!canvas || !selectedTemplate?.pdf_url) {
        setPdfRenderError('');
        return;
      }

      try {
        const response = await apiClient.get(selectedTemplate.pdf_url, {
          responseType: 'arraybuffer',
        });
        const pdf = await getDocument({ data: response.data }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.2 });

        if (cancelled) return;

        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport }).promise;

        if (!cancelled) {
          setPdfRenderError('');
        }
      } catch (error) {
        if (!cancelled) {
          setPdfRenderError('PDF-ul nu a putut fi randat în canvas.');
        }
      }
    };

    renderPdfPreview();

    return () => {
      cancelled = true;
    };
  }, [selectedTemplate?.pdf_url]);


  useEffect(() => {
    if (!availableFields.some((field) => field.key === selectedPaletteField)) {
      setSelectedPaletteField(availableFields[0]?.key || null);
    }
  }, [availableFields, selectedPaletteField]);

  useEffect(() => {
    function handleMove(event) {
      if (!dragRef.current || !previewRef.current || !selectedTemplate) return;
      const rect = previewRef.current.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
      const placementId = dragRef.current;
      setTemplates((current) => current.map((template) => {
        if (template.id !== selectedTemplate.id) return template;
        return {
          ...template,
          placements: template.placements.map((placement) => (
            placement.id === placementId ? { ...placement, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) } : placement
          )),
        };
      }));
    }

    function handleUp() {
      dragRef.current = null;
    }

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [selectedTemplate]);

  const updateSelectedTemplate = (mutator) => {
    setTemplates((current) => current.map((template) => (
      template.id === selectedId ? mutator(template) : template
    )));
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!uploadForm.pdf_file) {
      setMessage('Selectează un PDF pentru diploma nouă.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('event', eventId);
      formData.append('title', uploadForm.title || getDiplomaTemplateLabel(uploadForm.template_kind));
      formData.append('template_kind', uploadForm.template_kind);
      formData.append('category_scope', uploadForm.category_scope);
      formData.append('preview_orientation', uploadForm.preview_orientation);
      formData.append('placements', JSON.stringify([]));
      formData.append('pdf_file', uploadForm.pdf_file);
      const { data } = await diplomaTemplateAPI.create(formData);
      await loadData();
      setSelectedId(data.id);
      setShowTemplatePicker(false);
      setUploadForm((current) => ({ ...current, title: '', pdf_file: null }));
      setMessage('Șablonul de diplomă a fost încărcat cu succes.');
    } catch (error) {
      const detail = error.response?.data;
      setMessage(typeof detail === 'string' ? detail : JSON.stringify(detail || 'Încărcarea PDF-ului a eșuat.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCanvasClick = (event) => {
    if (!selectedTemplate || !selectedPaletteField || dragRef.current) return;
    const field = availableFields.find((item) => item.key === selectedPaletteField);
    if (!field || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const placement = {
      ...createDiplomaPlacement(field),
      x: Number(Math.min(100, Math.max(0, x)).toFixed(2)),
      y: Number(Math.min(100, Math.max(0, y)).toFixed(2)),
    };
    updateSelectedTemplate((template) => ({ ...template, placements: [...template.placements, placement] }));
    setSelectedPlacementId(placement.id);
  };

  const handleCanvasDrop = (event) => {
    event.preventDefault();
    if (!selectedTemplate || !previewRef.current) return;
    const fieldKey = event.dataTransfer.getData('application/x-diploma-field') || selectedPaletteField;
    const field = availableFields.find((item) => item.key === fieldKey);
    if (!field) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const placement = {
      ...createDiplomaPlacement(field),
      x: Number(Math.min(100, Math.max(0, x)).toFixed(2)),
      y: Number(Math.min(100, Math.max(0, y)).toFixed(2)),
    };
    updateSelectedTemplate((template) => ({ ...template, placements: [...template.placements, placement] }));
    setSelectedPlacementId(placement.id);
  };

  const showTemplateSelector = !selectedTemplate || showTemplatePicker;

  const handleSaveLayout = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    setMessage('');
    try {
      const payload = replacementPdfFile
        ? (() => {
            const formData = new FormData();
            formData.append('title', selectedTemplate.title || 'Diplomă');
            formData.append('template_kind', selectedTemplate.template_kind || 'first_place');
            formData.append('category_scope', selectedTemplate.category_scope || 'all');
            formData.append('preview_orientation', selectedTemplate.preview_orientation || 'landscape');
            formData.append('placements', JSON.stringify(selectedTemplate.placements || []));
            formData.append('is_active', String(Boolean(selectedTemplate.is_active)));
            formData.append('pdf_file', replacementPdfFile);
            return formData;
          })()
        : {
            title: selectedTemplate.title,
            template_kind: selectedTemplate.template_kind,
            category_scope: selectedTemplate.category_scope,
            preview_orientation: selectedTemplate.preview_orientation,
            placements: selectedTemplate.placements,
            is_active: selectedTemplate.is_active,
          };
      const { data } = await diplomaTemplateAPI.update(selectedTemplate.id, payload);
      setTemplates((current) => current.map((template) => (template.id === data.id ? { ...data, placements: data.placements || [] } : template)));
      setReplacementPdfFile(null);
      lastAutoSaveSignatureRef.current = JSON.stringify({
        title: data.title,
        template_kind: data.template_kind,
        category_scope: data.category_scope,
        preview_orientation: data.preview_orientation,
        placements: data.placements || [],
        is_active: data.is_active,
      });
      setMessage('Configurația diplomei a fost salvată.');
    } catch (error) {
      const detail = error.response?.data;
      setMessage(typeof detail === 'string' ? detail : JSON.stringify(detail || 'Salvarea configurației a eșuat.'));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!selectedTemplate || showTemplateSelector) return undefined;

    const payload = replacementPdfFile
      ? (() => {
          const formData = new FormData();
          formData.append('title', selectedTemplate.title || 'Diplomă');
          formData.append('template_kind', selectedTemplate.template_kind || 'first_place');
          formData.append('category_scope', selectedTemplate.category_scope || 'all');
          formData.append('preview_orientation', selectedTemplate.preview_orientation || 'landscape');
          formData.append('placements', JSON.stringify(selectedTemplate.placements || []));
          formData.append('is_active', String(Boolean(selectedTemplate.is_active)));
          formData.append('pdf_file', replacementPdfFile);
          return formData;
        })()
      : {
          title: selectedTemplate.title,
          template_kind: selectedTemplate.template_kind,
          category_scope: selectedTemplate.category_scope,
          preview_orientation: selectedTemplate.preview_orientation,
          placements: selectedTemplate.placements,
          is_active: selectedTemplate.is_active,
        };

    const signature = JSON.stringify({
      title: selectedTemplate.title,
      template_kind: selectedTemplate.template_kind,
      category_scope: selectedTemplate.category_scope,
      preview_orientation: selectedTemplate.preview_orientation,
      placements: selectedTemplate.placements || [],
      is_active: selectedTemplate.is_active,
      pdf_name: replacementPdfFile?.name || null,
    });

    if (lastAutoSaveSignatureRef.current === signature) return undefined;

    if (autoSaveTimeoutRef.current) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = window.setTimeout(async () => {
      try {
        setSaving(true);
        const { data } = await diplomaTemplateAPI.update(selectedTemplate.id, payload);
        setTemplates((current) => current.map((template) => (template.id === data.id ? { ...data, placements: data.placements || [] } : template)));
        setReplacementPdfFile(null);
        lastAutoSaveSignatureRef.current = signature;
      } catch (error) {
        const detail = error.response?.data;
        setMessage(typeof detail === 'string' ? detail : JSON.stringify(detail || 'Salvarea automată a eșuat.'));
      } finally {
        setSaving(false);
      }
    }, 500);

    return () => {
      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [selectedTemplate, replacementPdfFile, showTemplateSelector]);

  const handleDeleteTemplateForId = async (templateId) => {
    const templateToDelete = templates.find((template) => template.id === templateId);
    if (!templateToDelete || !window.confirm('Ștergi acest șablon de diplomă?')) return;
    setSaving(true);
    setMessage('');
    try {
      await diplomaTemplateAPI.delete(templateToDelete.id);
      const remaining = templates.filter((template) => template.id !== templateToDelete.id);
      setTemplates(remaining);
      if (selectedId === templateToDelete.id) {
        setSelectedId(remaining[0]?.id || null);
        setSelectedPlacementId(null);
      }
      setShowTemplatePicker(!remaining.length || selectedId === templateToDelete.id);
      setMessage('Șablonul de diplomă a fost șters.');
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Ștergerea șablonului a eșuat.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    await handleDeleteTemplateForId(selectedTemplate.id);
  };

  const handleDuplicateTemplateForId = async (templateId) => {
    const templateToDuplicate = templates.find((template) => template.id === templateId);
    if (!templateToDuplicate) return;
    setSaving(true);
    setMessage('');
    try {
      const { data } = await diplomaTemplateAPI.duplicate(templateToDuplicate.id);
      await loadData();
      setSelectedId(data.id);
      setSelectedPlacementId(data.placements?.[0]?.id || null);
      setShowTemplatePicker(false);
      setMessage('Șablonul de diplomă a fost duplicat.');
    } catch (error) {
      const detail = error.response?.data?.detail || error.response?.data;
      setMessage(typeof detail === 'string' ? detail : JSON.stringify(detail || 'Duplicarea șablonului a eșuat.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicateTemplate = async () => {
    if (!selectedTemplate) return;
    await handleDuplicateTemplateForId(selectedTemplate.id);
  };

  const handlePlacementChange = (key, value) => {
    if (!selectedTemplate || !selectedPlacementId) return;
    updateSelectedTemplate((template) => ({
      ...template,
      placements: template.placements.map((placement) => (
        placement.id === selectedPlacementId ? { ...placement, [key]: value } : placement
      )),
    }));
  };

  const handleRemovePlacement = () => {
    if (!selectedTemplate || !selectedPlacementId) return;
    updateSelectedTemplate((template) => ({
      ...template,
      placements: template.placements.filter((placement) => placement.id !== selectedPlacementId),
    }));
    setSelectedPlacementId(null);
  };

  const handleRemovePlacementById = (placementId) => {
    if (!selectedTemplate || !placementId) return;
    updateSelectedTemplate((template) => ({
      ...template,
      placements: template.placements.filter((placement) => placement.id !== placementId),
    }));
    if (selectedPlacementId === placementId) {
      setSelectedPlacementId(null);
    }
  };

  const getPlacementPreviewLabel = (placement) => {
    const base = placement?.sample || getDiplomaFieldToken(placement?.field_key) || placement?.label || '';
    const maxLength = Math.max(0, Number(placement?.max_length) || 0);
    return maxLength > 0 ? base.slice(0, maxLength) : base;
  };

  if (loading) return <div className="flex h-full items-center justify-center"><Spinner /></div>;

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden bg-gray-50 p-3 sm:p-4">
      {message && (
        <div className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-700">{message}</div>
      )}

      <div className={`grid min-h-0 flex-1 gap-4 ${showTemplateSelector ? 'grid-cols-1' : 'xl:grid-cols-[minmax(280px,320px)_minmax(0,1.35fr)]'}`}>
        {showTemplateSelector ? (
          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-2">
            <Card className="flex min-h-0 flex-col">
              <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-gray-900">Crează sablon nou</h2>
              <form onSubmit={handleUpload} className="space-y-3">
                <select
                  value={uploadForm.template_kind}
                  onChange={(event) => setUploadForm((current) => ({ ...current, template_kind: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {DIPLOMA_TEMPLATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select
                  value={uploadForm.category_scope}
                  onChange={(event) => setUploadForm((current) => ({ ...current, category_scope: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {DIPLOMA_CATEGORY_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <input
                  value={uploadForm.title}
                  onChange={(event) => setUploadForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Titlu șablon"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <select
                  value={uploadForm.preview_orientation}
                  onChange={(event) => setUploadForm((current) => ({ ...current, preview_orientation: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => setUploadForm((current) => ({ ...current, pdf_file: event.target.files?.[0] || null }))}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-200 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gray-700"
                />
                <button type="submit" disabled={saving} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">Încarcă PDF</button>
              </form>
            </Card>

            <Card className="flex min-h-0 flex-col">
              <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-gray-900">Sabloane existente</h2>
              <div className="min-h-0 flex-1 overflow-y-auto space-y-2">
                {templates.map((template) => (
                  <div key={template.id} className="rounded-lg border border-gray-200 bg-white p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(template.id);
                        setSelectedPlacementId(template.placements?.[0]?.id || null);
                        setShowTemplatePicker(false);
                      }}
                      className="w-full text-left"
                    >
                      <div className="text-sm font-semibold text-gray-900">{template.title}</div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">{getDiplomaTemplateLabel(template.template_kind)}</div>
                      <div className="mt-1 text-[11px] font-semibold text-gray-500">{getDiplomaCategoryScopeLabel(template.category_scope || 'all')}</div>
                    </button>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(template.id);
                          setSelectedPlacementId(template.placements?.[0]?.id || null);
                          setShowTemplatePicker(false);
                        }}
                        className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Editează
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateTemplateForId(template.id)}
                        className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        Duplică
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplateForId(template.id)}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                      >
                        Șterge
                      </button>
                    </div>
                  </div>
                ))}
                {!templates.length && <p className="text-sm text-gray-500">Nu există încă șabloane de diplomă pentru acest eveniment.</p>}
              </div>
            </Card>
          </div>
        ) : (
          <>
            <Card className="flex min-h-0 flex-col overflow-hidden">
              <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-gray-900">Câmpuri și proprietăți</h2>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="space-y-3 border-b border-gray-200 pb-4">
                  {selectedTemplate && (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Titlu șablon</label>
                        <input
                          value={selectedTemplate.title || ''}
                          onChange={(event) => updateSelectedTemplate((template) => ({ ...template, title: event.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="Titlu șablon"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tip diplomă</label>
                        <select
                          value={selectedTemplate.template_kind || 'first_place'}
                          onChange={(event) => updateSelectedTemplate((template) => ({ ...template, template_kind: event.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                          {DIPLOMA_TEMPLATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tip categorie pentru șablon</label>
                        <select
                          value={selectedTemplate.category_scope || 'all'}
                          onChange={(event) => updateSelectedTemplate((template) => ({ ...template, category_scope: event.target.value, placements: template.placements || [] }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                          {DIPLOMA_CATEGORY_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      {(selectedTemplate.category_scope || 'all') === 'all' ? (
                        <p className="text-xs text-blue-700">Else / fallback este template-ul implicit. Se folosește automat când `solo`, `echipă` sau `luptă` nu au un template dedicat. Poți porni de aici și apoi folosi `Duplică` pentru o variantă specifică.</p>
                      ) : (
                        <p className="text-xs text-gray-500">Tipul selectat suprascrie template-ul Else / fallback doar pentru categoria curentă.</p>
                      )}
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Orientare preview</label>
                        <select
                          value={selectedTemplate.preview_orientation || 'landscape'}
                          onChange={(event) => updateSelectedTemplate((template) => ({ ...template, preview_orientation: event.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="landscape">Landscape</option>
                          <option value="portrait">Portrait</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedTemplate.is_active)}
                          onChange={(event) => updateSelectedTemplate((template) => ({ ...template, is_active: event.target.checked }))}
                        />
                        Activ pentru generare
                      </label>
                      <p className="text-xs text-gray-500">Pentru solo și luptă folosește câmpul Nume sportiv (club). Pentru echipă folosește Nume echipă (club).</p>
                    </>
                  )}

                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Adaugă câmp pe diploma</label>
                  <div className="grid grid-cols-1 gap-2">
                    {availableFields.map((field) => (
                      <button
                        key={field.key}
                        type="button"
                        draggable={Boolean(selectedTemplate)}
                        onClick={() => setSelectedPaletteField(field.key)}
                        onDragStart={(event) => {
                          setSelectedPaletteField(field.key);
                          event.dataTransfer.effectAllowed = 'copy';
                          event.dataTransfer.setData('application/x-diploma-field', field.key);
                        }}
                        className={`rounded-lg border px-3 py-2 text-left ${selectedPaletteField === field.key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                      >
                        <div className="text-sm font-semibold text-gray-900">{field.label}</div>
                        <div className="text-xs text-gray-500">{`{{${getDiplomaFieldBinding(field.key)}}}`}</div>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payload dinamic pentru {getDiplomaCategoryScopeLabel(selectedTemplate?.category_scope || 'all')}</div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-gray-700">{JSON.stringify(payloadExample, null, 2)}</pre>
                  </div>
                  <p className="text-xs text-gray-500">Poți trage un câmp direct pe diploma PDF sau îl poți selecta și apoi face click pe poziția dorită.</p>
                </div>

                <div className="mt-4 space-y-3 pb-2">
                  {selectedTemplate && selectedTemplate.placements.length > 0 && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Câmpuri aplicate</div>
                      <div className="space-y-2">
                        {selectedTemplate.placements.map((placement) => (
                          <div key={placement.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setSelectedPlacementId(placement.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="truncate text-sm font-medium text-gray-900">{placement.label}</div>
                              <div className="truncate text-[11px] text-gray-500">{getPlacementPreviewLabel(placement)}</div>
                              <div className="text-[11px] text-gray-500">X {placement.x}% · Y {placement.y}%</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePlacementById(placement.id)}
                              className="rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
                            >
                              Șterge
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedPlacement ? (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Etichetă afișată</label>
                        <input value={selectedPlacement.label || ''} onChange={(event) => handlePlacementChange('label', event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">X (%)</label>
                          <input type="number" min="0" max="100" step="0.1" value={selectedPlacement.x} onChange={(event) => handlePlacementChange('x', Number(event.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Y (%)</label>
                          <input type="number" min="0" max="100" step="0.1" value={selectedPlacement.y} onChange={(event) => handlePlacementChange('y', Number(event.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Font size</label>
                          <input type="number" min="8" max="96" value={selectedPlacement.font_size || 26} onChange={(event) => handlePlacementChange('font_size', Number(event.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Lățime (%)</label>
                          <input type="number" min="5" max="100" value={selectedPlacement.width || 40} onChange={(event) => handlePlacementChange('width', Number(event.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Lungime maximă caractere</label>
                        <input
                          type="number"
                          min="0"
                          max="500"
                          value={selectedPlacement.max_length || 0}
                          onChange={(event) => handlePlacementChange('max_length', Number(event.target.value))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                        <p className="mt-1 text-[11px] text-gray-500">0 înseamnă fără limită. Textul va fi tăiat automat la generare.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Aliniere</label>
                          <select value={selectedPlacement.align || 'center'} onChange={(event) => handlePlacementChange('align', event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Culoare</label>
                          <input type="color" value={selectedPlacement.color || '#111827'} onChange={(event) => handlePlacementChange('color', event.target.value)} className="h-10 w-full rounded-lg border border-gray-300 px-1 py-1" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={Boolean(selectedPlacement.bold)} onChange={(event) => handlePlacementChange('bold', event.target.checked)} />
                        Bold
                      </label>
                      <button type="button" onClick={handleRemovePlacement} className="w-full rounded-lg bg-red-100 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-200">Elimină câmpul selectat</button>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">Selectează un câmp de pe diploma din preview ca să îi editezi proprietățile.</p>
                  )}
                </div>
              </div>
            </Card>

            <div className="flex min-h-0 flex-col overflow-hidden gap-2">
              <div className="rounded-lg border border-gray-200 bg-white p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowTemplatePicker(true)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Înapoi la șabloane
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700">
                    <input type="checkbox" checked={showBleed} onChange={(event) => setShowBleed(event.target.checked)} />
                    Bleed
                  </label>
                  <label className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700">
                    <input type="checkbox" checked={showTrim} onChange={(event) => setShowTrim(event.target.checked)} />
                    Trim
                  </label>
                  <label className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700">
                    <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                    Grid
                  </label>
                  <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700">
                    <button type="button" onClick={() => setPreviewZoom((current) => Number(Math.max(0.5, current - 0.1).toFixed(2)))} className="h-6 w-6 rounded hover:bg-gray-100">−</button>
                    <span className="min-w-[42px] text-center">{Math.round(previewZoom * 100)}%</span>
                    <button type="button" onClick={() => setPreviewZoom((current) => Number(Math.min(2, current + 0.1).toFixed(2)))} className="h-6 w-6 rounded hover:bg-gray-100">+</button>
                    <button type="button" onClick={() => setPreviewZoom(1)} className="ml-1 rounded px-1.5 py-0.5 hover:bg-gray-100">Reset</button>
                  </div>
                </div>
                </div>
              </div>

              <Card className="flex min-h-0 flex-col overflow-hidden">

              {selectedTemplate ? (
                <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 p-0">
                  <div
                    ref={previewRef}
                    onClick={handleCanvasClick}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleCanvasDrop}
                    className="relative h-full w-full overflow-auto bg-white"
                    style={{
                      width: '100%',
                      maxWidth: '100%',
                      minHeight: '100%',
                    }}
                  >
                    <div
                      className="relative mx-auto overflow-hidden bg-white"
                      style={{
                        width: '100%',
                        maxWidth: '100%',
                        aspectRatio: getRatio(selectedTemplate.preview_orientation),
                        transform: `scale(${previewZoom})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      <div className="absolute inset-0 z-0 flex items-center justify-center bg-white">
                        {pdfRenderError ? (
                          <div className="p-4 text-sm text-red-600">{pdfRenderError}</div>
                        ) : (
                          <canvas ref={pdfCanvasRef} className="block h-full w-full object-contain" />
                        )}
                      </div>

                      {showGrid && (
                        <div
                          className="pointer-events-none absolute inset-0 z-10"
                          style={{
                            backgroundImage: 'linear-gradient(to right, rgba(37,99,235,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(37,99,235,0.18) 1px, transparent 1px)',
                            backgroundSize: '5% 5%',
                          }}
                        />
                      )}

                      {showBleed && (
                        <div className="pointer-events-none absolute inset-[1.5%] z-20 border-2 border-dashed border-red-400/80">
                          <div className="absolute left-2 top-1 rounded bg-red-500/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Bleed</div>
                        </div>
                      )}

                      {showTrim && (
                        <div className="pointer-events-none absolute inset-[4%] z-20 border-2 border-dashed border-emerald-500/80">
                          <div className="absolute left-2 top-1 rounded bg-emerald-600/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Trim</div>
                        </div>
                      )}

                      <div className="pointer-events-none absolute inset-0 z-30">
                        {selectedTemplate.placements.map((placement) => (
                          <button
                            key={placement.id}
                            type="button"
                            onMouseDown={(event) => {
                              event.stopPropagation();
                              dragRef.current = placement.id;
                              setSelectedPlacementId(placement.id);
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedPlacementId(placement.id);
                            }}
                            className={`pointer-events-auto absolute z-40 cursor-move rounded px-2 py-1 pr-7 shadow ${selectedPlacementId === placement.id ? 'ring-2 ring-blue-500' : 'ring-1 ring-black/10'}`}
                            style={{
                              left: `${placement.x}%`,
                              top: `${placement.y}%`,
                              width: `${placement.width || 40}%`,
                              transform: 'translate(-50%, -50%)',
                              color: placement.color || '#111827',
                              fontSize: `${placement.font_size || 26}px`,
                              textAlign: placement.align || 'center',
                              fontWeight: placement.bold ? 700 : 400,
                              backgroundColor: 'rgba(255,255,255,0.65)',
                            }}
                          >
                            {getPlacementPreviewLabel(placement)}
                            <span
                              role="button"
                              tabIndex={0}
                              onMouseDown={(event) => {
                                event.stopPropagation();
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRemovePlacementById(placement.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleRemovePlacementById(placement.id);
                                }
                              }}
                              className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/90 text-[10px] font-bold text-red-600 ring-1 ring-red-200"
                            >
                              ×
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-500">Alege sau încarcă un șablon PDF ca să începi configurarea.</div>
              )}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}