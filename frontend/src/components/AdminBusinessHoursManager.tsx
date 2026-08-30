import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { adminApi } from "../lib/api";

type Hour = {
  id?: string;
  weekday: number;
  enabled: boolean;
  opensAt: string;
  closesAt: string;
  position?: number;
};

type IntervalDraft = {
  opensAt: string;
  closesAt: string;
};

type DayDraft = {
  weekday: number;
  enabled: boolean;
  intervals: IntervalDraft[];
};

const weekdayNames = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

const defaultInterval =
  (): IntervalDraft => ({
    opensAt: "18:00",
    closesAt: "23:00",
  });

export function AdminBusinessHoursManager() {
  const client = useQueryClient();

  const hours = useQuery({
    queryKey: ["admin-hours-v32"],
    queryFn: () =>
      adminApi<Hour[]>(
        "/admin/business-hours",
      ),
  });

  const [days, setDays] =
    useState<DayDraft[]>(() =>
      weekdayNames.map(
        (_, weekday) => ({
          weekday,
          enabled: false,
          intervals: [
            defaultInterval(),
          ],
        }),
      ),
    );

  const [localError, setLocalError] =
    useState("");

  useEffect(() => {
    if (!hours.data) {
      return;
    }

    const next =
      weekdayNames.map(
        (_, weekday): DayDraft => {
          const rows =
            hours.data
              ?.filter(
                (hour) =>
                  hour.weekday === weekday,
              )
              .sort(
                (a, b) =>
                  (a.position ?? 0) -
                  (b.position ?? 0),
              ) ?? [];

          const enabledRows =
            rows.filter(
              (hour) => hour.enabled,
            );

          const source =
            enabledRows.length > 0
              ? enabledRows
              : rows.slice(0, 1);

          return {
            weekday,
            enabled:
              enabledRows.length > 0,
            intervals:
              source.length > 0
                ? source.map(
                    (hour) => ({
                      opensAt:
                        hour.opensAt,
                      closesAt:
                        hour.closesAt,
                    }),
                  )
                : [
                    defaultInterval(),
                  ],
          };
        },
      );

    setDays(next);
  }, [hours.data]);

  const save = useMutation({
    mutationFn: (body: Hour[]) =>
      adminApi<Hour[]>(
        "/admin/business-hours",
        {
          method: "PUT",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: async () => {
      setLocalError("");

      await Promise.all([
        client.invalidateQueries({
          queryKey: [
            "admin-hours-v32",
          ],
        }),
        client.invalidateQueries({
          queryKey: ["admin-hours"],
        }),
        client.invalidateQueries({
          queryKey: ["store"],
        }),
      ]);
    },
  });

  const summaryByDay = useMemo(
    () =>
      new Map(
        days.map((day) => [
          day.weekday,
          day.enabled
            ? day.intervals
                .map(
                  (interval) =>
                    `${interval.opensAt}–${interval.closesAt}`,
                )
                .join(" · ")
            : "Fechado",
        ]),
      ),
    [days],
  );

  function updateDay(
    weekday: number,
    updater: (
      day: DayDraft,
    ) => DayDraft,
  ) {
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday
          ? updater(day)
          : day,
      ),
    );
  }

  function addInterval(
    weekday: number,
  ) {
    updateDay(weekday, (day) => {
      if (
        day.intervals.length >= 5
      ) {
        return day;
      }

      return {
        ...day,
        enabled: true,
        intervals: [
          ...day.intervals,
          defaultInterval(),
        ],
      };
    });
  }

  function removeInterval(
    weekday: number,
    index: number,
  ) {
    updateDay(weekday, (day) => {
      if (
        day.intervals.length <= 1
      ) {
        return day;
      }

      return {
        ...day,
        intervals:
          day.intervals.filter(
            (_, candidateIndex) =>
              candidateIndex !== index,
          ),
      };
    });
  }

  function changeInterval(
    weekday: number,
    index: number,
    field:
      | "opensAt"
      | "closesAt",
    value: string,
  ) {
    updateDay(weekday, (day) => ({
      ...day,
      intervals:
        day.intervals.map(
          (interval, candidateIndex) =>
            candidateIndex === index
              ? {
                  ...interval,
                  [field]: value,
                }
              : interval,
        ),
    }));
  }

  function saveAll() {
    for (const day of days) {
      if (!day.enabled) {
        continue;
      }

      for (const interval of
        day.intervals) {
        if (
          !interval.opensAt ||
          !interval.closesAt
        ) {
          setLocalError(
            `Preencha todos os horários de ${weekdayNames[day.weekday]}.`,
          );
          return;
        }

        if (
          interval.opensAt ===
          interval.closesAt
        ) {
          setLocalError(
            `Em ${weekdayNames[day.weekday]}, abertura e fechamento não podem ser iguais.`,
          );
          return;
        }
      }
    }

    const body: Hour[] =
      days.flatMap<Hour>((day): Hour[] => {
        if (!day.enabled) {
          const first =
            day.intervals[0] ??
            defaultInterval();

          return [
            {
              weekday:
                day.weekday,
              enabled: false,
              opensAt:
                first.opensAt,
              closesAt:
                first.closesAt,
              position: 0,
            },
          ];
        }

        return [...day.intervals]
          .sort((a, b) =>
            a.opensAt.localeCompare(
              b.opensAt,
            ),
          )
          .map(
            (
              interval,
              position,
            ) => ({
              weekday:
                day.weekday,
              enabled: true,
              opensAt:
                interval.opensAt,
              closesAt:
                interval.closesAt,
              position,
            }),
          );
      });

    setLocalError("");
    save.mutate(body);
  }

  return (
    <section className="admin-form settings-form multi-hours-manager">
      <div className="settings-section-heading">
        <div>
          <small>
            Funcionamento
          </small>
          <h2>
            Horários da loja
          </h2>
          <p>
            Você pode ter mais de um
            período no mesmo dia, por
            exemplo almoço e jantar.
          </p>
        </div>
      </div>

      {hours.isLoading && (
        <p>Carregando horários...</p>
      )}

      <div className="business-days-list">
        {days.map((day) => (
          <details
            className="business-day-card"
            key={day.weekday}
          >
            <summary>
              <div>
                <strong>
                  {
                    weekdayNames[
                      day.weekday
                    ]
                  }
                </strong>
                <small>
                  {summaryByDay.get(
                    day.weekday,
                  )}
                </small>
              </div>

              <span>
                {day.enabled
                  ? `${day.intervals.length} horário${day.intervals.length > 1 ? "s" : ""}`
                  : "Fechado"}
              </span>
            </summary>

            <div className="business-day-body">
              <label className="business-day-enabled">
                <input
                  type="checkbox"
                  checked={day.enabled}
                  onChange={(event) =>
                    updateDay(
                      day.weekday,
                      (current) => ({
                        ...current,
                        enabled:
                          event.target
                            .checked,
                      }),
                    )
                  }
                />
                Loja abre neste dia
              </label>

              {day.enabled && (
                <>
                  <div className="business-interval-list">
                    {day.intervals.map(
                      (
                        interval,
                        index,
                      ) => (
                        <div
                          className="business-interval-row"
                          key={index}
                        >
                          <label>
                            <span>
                              Abre
                            </span>
                            <input
                              type="time"
                              value={
                                interval.opensAt
                              }
                              onChange={(
                                event,
                              ) =>
                                changeInterval(
                                  day.weekday,
                                  index,
                                  "opensAt",
                                  event
                                    .target
                                    .value,
                                )
                              }
                            />
                          </label>

                          <span>
                            até
                          </span>

                          <label>
                            <span>
                              Fecha
                            </span>
                            <input
                              type="time"
                              value={
                                interval.closesAt
                              }
                              onChange={(
                                event,
                              ) =>
                                changeInterval(
                                  day.weekday,
                                  index,
                                  "closesAt",
                                  event
                                    .target
                                    .value,
                                )
                              }
                            />
                          </label>

                          <button
                            type="button"
                            className="icon-button danger"
                            title="Remover horário"
                            disabled={
                              day.intervals
                                .length <=
                              1
                            }
                            onClick={() =>
                              removeInterval(
                                day.weekday,
                                index,
                              )
                            }
                          >
                            <Trash2 />
                          </button>
                        </div>
                      ),
                    )}
                  </div>

                  <button
                    type="button"
                    className="secondary add-business-interval"
                    disabled={
                      day.intervals.length >=
                      5
                    }
                    onClick={() =>
                      addInterval(
                        day.weekday,
                      )
                    }
                  >
                    <Plus />
                    Adicionar horário
                  </button>
                </>
              )}
            </div>
          </details>
        ))}
      </div>

      {(localError ||
        save.error ||
        hours.error) && (
        <p className="error-text">
          {localError ||
            save.error?.message ||
            hours.error?.message}
        </p>
      )}

      {save.isSuccess &&
        !save.isPending && (
          <p className="settings-success-text">
            ✓ Horários salvos.
          </p>
        )}

      <button
        type="button"
        className="primary"
        disabled={save.isPending}
        onClick={saveAll}
      >
        {save.isPending
          ? "Salvando..."
          : "Salvar horários"}
      </button>
    </section>
  );
}
