import { Routes, Route } from 'react-router-dom';
import SelectScreen from './pages/SelectScreen';
import DisplayScreen from './pages/DisplayScreen';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SelectScreen />} />
      <Route path="/display/:fieldId" element={<DisplayScreen />} />
    </Routes>
  );
}
