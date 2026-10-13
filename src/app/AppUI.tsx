import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ISODate, Minutes } from '../domain/types';
import { AppointmentDrawer } from './drawers/AppointmentDrawer';
import { CustomerDrawer, NEW_CUSTOMER } from './drawers/CustomerDrawer';
import { NewAppointmentDrawer } from './drawers/NewAppointmentDrawer';
import { SessionDrawer } from './drawers/SessionDrawer';

export interface NewAppointmentPrefill {
  date?: ISODate;
  start?: Minutes;
  staffId?: string;
  customerId?: string;
  mode?: 'appointment' | 'block' | 'class';
}

interface AppUI {
  openAppointment: (id: string) => void;
  openSession: (id: string) => void;
  openCustomer: (id: string) => void;
  newCustomer: () => void;
  newAppointment: (prefill?: NewAppointmentPrefill) => void;
}

const Ctx = createContext<AppUI | null>(null);

/** App-wide panels so any screen (calendar, lists, dashboard) can open the same details and create flows. */
export function AppUIProvider({ children }: { children: ReactNode }) {
  const [apptId, setApptId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<NewAppointmentPrefill | null>(null);

  const newAppointment = useCallback((p: NewAppointmentPrefill = {}) => setPrefill(p), []);
  const newCustomer = useCallback(() => setCustomerId(NEW_CUSTOMER), []);
  const value = useMemo<AppUI>(
    () => ({ openAppointment: setApptId, openSession: setSessionId, openCustomer: setCustomerId, newCustomer, newAppointment }),
    [newAppointment, newCustomer],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <CustomerDrawer id={customerId} onClose={() => setCustomerId(null)} onCreated={setCustomerId} />
      <AppointmentDrawer id={apptId} onClose={() => setApptId(null)} />
      <SessionDrawer id={sessionId} onClose={() => setSessionId(null)} />
      <NewAppointmentDrawer
        prefill={prefill}
        onClose={() => setPrefill(null)}
        onCreated={(id, kind) => {
          setPrefill(null);
          if (id && kind === 'session') setSessionId(id);
          else if (id) setApptId(id);
        }}
      />
    </Ctx.Provider>
  );
}

export function useAppUI() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppUI outside provider');
  return v;
}
