import { useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import type { Product } from "../types";
import { formatMoney } from "../lib/format";
import { useCart } from "../store/cart";

export function ProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const addItem = useCart((state) => state.addItem);

  const options = useMemo(() => product.optionGroups.flatMap((group) => (selected[group.id] ?? []).map((id) => {
    const option = group.options.find((candidate) => candidate.id === id)!;
    return { optionId: option.id, optionName: option.name, groupName: group.name, priceCents: option.priceCents, quantity: 1 };
  })), [product, selected]);
  const unit = product.priceCents + options.reduce((sum, option) => sum + option.priceCents, 0);

  /* MESA4_OPTIONAL_ADDONS_V27 */
  const requiredGroups = useMemo(
    () =>
      product.optionGroups.filter(
        (group) =>
          group.required ||
          group.minSelection > 0,
      ),
    [product.optionGroups],
  );

  const optionalGroups = useMemo(
    () =>
      product.optionGroups.filter(
        (group) =>
          !group.required &&
          group.minSelection === 0,
      ),
    [product.optionGroups],
  );

  const optionalSelectionCount =
    optionalGroups.reduce(
      (total, group) =>
        total +
        (selected[group.id]?.length ?? 0),
      0,
    );

  const optionalExtraCents =
    optionalGroups.reduce(
      (total, group) => {
        const selectedIds =
          selected[group.id] ?? [];

        return (
          total +
          group.options
            .filter((option) =>
              selectedIds.includes(option.id),
            )
            .reduce(
              (sum, option) =>
                sum + option.priceCents,
              0,
            )
        );
      },
      0,
    );

  function toggle(groupId: string, optionId: string, max: number) {
    setSelected((current) => {
      const values = current[groupId] ?? [];
      if (values.includes(optionId)) return { ...current, [groupId]: values.filter((id) => id !== optionId) };
      if (max === 1) return { ...current, [groupId]: [optionId] };
      if (values.length >= max) return current;
      return { ...current, [groupId]: [...values, optionId] };
    });
  }

  function submit() {
    for (const group of product.optionGroups) {
      const count = selected[group.id]?.length ?? 0;
      const minimum = group.required ? Math.max(1, group.minSelection) : group.minSelection;
      if (count < minimum) return alert(`Escolha uma opção em ${group.name}`);
    }
    addItem({ productId: product.id, productName: product.name, imageUrl: product.imageUrl, basePriceCents: product.priceCents, quantity, notes: notes || undefined, options });
    onClose();
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal product-modal" onMouseDown={(event) => event.stopPropagation()}>
      <button className="icon-button close" onClick={onClose}><X /></button>
      {product.imageUrl && <img className="modal-image" src={product.imageUrl} alt={product.name} />}
      <div className="modal-body">
        <h2>{product.name}</h2>
        <p className="muted">{product.description}</p>
        {requiredGroups.map((group) => (
          <section
            className="option-group"
            key={group.id}
          >
            <div>
              <strong>{group.name}</strong>
              <span>Obrigatório</span>
            </div>

            {group.options.map((option) => (
              <label
                className="option-row"
                key={option.id}
              >
                <input
                  type={
                    group.maxSelection === 1
                      ? "radio"
                      : "checkbox"
                  }
                  name={group.id}
                  checked={(
                    selected[group.id] ?? []
                  ).includes(option.id)}
                  onChange={() =>
                    toggle(
                      group.id,
                      option.id,
                      group.maxSelection,
                    )
                  }
                />

                <span>{option.name}</span>

                <b>
                  {option.priceCents
                    ? `+ ${formatMoney(
                        option.priceCents,
                      )}`
                    : "Grátis"}
                </b>
              </label>
            ))}
          </section>
        ))}

        {optionalGroups.length > 0 && (
          <details
            className="optional-addons"
            data-optional-addons-v27="true"
          >
            <summary>
              <div className="optional-addons-heading">
                <span className="optional-addons-icon">
                  ✨
                </span>

                <div>
                  <strong>
                    Quer turbinar seu lanche?
                  </strong>

                  <small>
                    {optionalSelectionCount > 0
                      ? `${optionalSelectionCount} adicional${optionalSelectionCount > 1 ? "is" : ""} escolhido${optionalSelectionCount > 1 ? "s" : ""}`
                      : "Adicione extras ao seu pedido"}
                  </small>
                </div>
              </div>

              <div className="optional-addons-value">
                {optionalExtraCents > 0 ? (
                  <b>
                    +{" "}
                    {formatMoney(
                      optionalExtraCents,
                    )}
                  </b>
                ) : (
                  <span>Ver opções</span>
                )}
              </div>
            </summary>

            <div className="optional-addons-content">
              {optionalGroups.map(
                (group) => (
                  <section
                    className="option-group optional-option-group"
                    key={group.id}
                  >
                    <div>
                      <strong>
                        {group.name}
                      </strong>

                      <span>
                        Até{" "}
                        {group.maxSelection}
                      </span>
                    </div>

                    {group.options.map(
                      (option) => (
                        <label
                          className="option-row"
                          key={option.id}
                        >
                          <input
                            type={
                              group.maxSelection === 1
                                ? "radio"
                                : "checkbox"
                            }
                            name={group.id}
                            checked={(
                              selected[group.id] ??
                              []
                            ).includes(
                              option.id,
                            )}
                            onChange={() =>
                              toggle(
                                group.id,
                                option.id,
                                group.maxSelection,
                              )
                            }
                          />

                          <span>
                            {option.name}
                          </span>

                          <b>
                            {option.priceCents
                              ? `+ ${formatMoney(
                                  option.priceCents,
                                )}`
                              : "Grátis"}
                          </b>
                        </label>
                      ),
                    )}
                  </section>
                ),
              )}
            </div>
          </details>
        )}
        <label className="field"><span>Observação</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} placeholder="Ex.: sem cebola" /></label>
        <div className="modal-footer">
          <div className="quantity"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus /></button><span>{quantity}</span><button onClick={() => setQuantity(quantity + 1)}><Plus /></button></div>
          <button className="primary grow" onClick={submit}>Adicionar · {formatMoney(unit * quantity)}</button>
        </div>
      </div>
    </div>
  </div>;
}
