import {
  Button, Checkbox, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui';

/** Group create modal (admin Centralizator matrix) - birth-date range + "allow younger". */
export function GroupFormModal({ ctx }) {
  const { groupModal, setGroupModal, groupForm, setGroupForm, handleCustomGroup, busy } = ctx;
  if (!groupModal) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) setGroupModal(null); }}>
      <DialogContent>
        <form onSubmit={handleCustomGroup}>
          <DialogHeader>
            <DialogTitle>Grupă nouă</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Nume</Label>
              <Input
                id="group-name"
                value={groupForm.name}
                onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="ex: Grupa 0"
                autoFocus
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="group-birth-start">Data naștere (de la)</Label>
                <Input
                  id="group-birth-start"
                  type="date"
                  value={groupForm.birth_date_start}
                  onChange={(e) => setGroupForm((prev) => ({ ...prev, birth_date_start: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-birth-end">Data naștere (până la)</Label>
                <Input
                  id="group-birth-end"
                  type="date"
                  value={groupForm.birth_date_end}
                  onChange={(e) => setGroupForm((prev) => ({ ...prev, birth_date_end: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="group-allow-younger"
                checked={groupForm.allow_younger}
                onCheckedChange={(checked) => setGroupForm((prev) => ({ ...prev, allow_younger: checked === true }))}
              />
              <Label htmlFor="group-allow-younger" className="font-normal">Acceptă sportivi mai tineri</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGroupModal(null)}>Anulează</Button>
            <Button type="submit" disabled={busy || !groupForm.name.trim()}>Salvează</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Category create modal (admin Centralizator matrix) - name + type + gender. */
export function CategoryFormModal({ ctx }) {
  const { catModal, setCatModal, catForm, setCatForm, handleAddCustomCat, busy } = ctx;
  if (!catModal) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) setCatModal(null); }}>
      <DialogContent>
        <form onSubmit={handleAddCustomCat}>
          <DialogHeader>
            <DialogTitle>Categorie nouă</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Nume</Label>
              <Input
                id="cat-name"
                value={catForm.name}
                onChange={(e) => setCatForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="ex: Khoi Quyen"
                autoFocus
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tip categorie</Label>
                <Select value={catForm.category_type} onValueChange={(value) => setCatForm((prev) => ({ ...prev, category_type: value }))}>
                  <SelectTrigger aria-label="Tip categorie">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo">Solo</SelectItem>
                    <SelectItem value="team">Echipă</SelectItem>
                    <SelectItem value="fight">Luptă</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Gen</Label>
                <Select value={catForm.gender} onValueChange={(value) => setCatForm((prev) => ({ ...prev, gender: value }))}>
                  <SelectTrigger aria-label="Gen">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Masculin</SelectItem>
                    <SelectItem value="female">Feminin</SelectItem>
                    <SelectItem value="mixt">Mixt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCatModal(null)}>Anulează</Button>
            <Button type="submit" disabled={busy || !catForm.name.trim()}>Salvează</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
