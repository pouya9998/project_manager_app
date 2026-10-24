import DatePicker, { DateObject } from 'react-multi-date-picker';
import type { Value } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import 'react-multi-date-picker/styles/colors/green.css';

type Props = {
  value?: string;
  onChange: (isoDate: string) => void;
  className?: string;
  placeholder?: string;
};

/** UI is Jalali; value is Gregorian `YYYY-MM-DD` for the API. */
export default function JalaliDatePicker({
  value,
  onChange,
  className = '',
  placeholder = 'انتخاب تاریخ شمسی',
}: Props) {
  const pickerValue: Value = value
    ? new DateObject({
        date: value,
        format: 'YYYY-MM-DD',
        calendar: gregorian,
        locale: gregorian_en,
      }).convert(persian, persian_fa)
    : null;

  return (
    <DatePicker
      value={pickerValue}
      calendar={persian}
      locale={persian_fa}
      calendarPosition="bottom-right"
      containerClassName="w-full"
      inputClass={`input w-full ${className}`}
      placeholder={placeholder}
      format="YYYY/MM/DD"
      editable={false}
      className="green"
      onChange={(date: DateObject | DateObject[] | null) => {
        if (!date || Array.isArray(date)) {
          onChange('');
          return;
        }
        const g = date.convert(gregorian, gregorian_en);
        onChange(g.format('YYYY-MM-DD'));
      }}
    />
  );
}
