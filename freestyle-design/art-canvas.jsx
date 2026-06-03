// Freestyle — Artwork canvas composition + boot.

function ArtCanvas() {
  return (
    <DesignCanvas>
      <DCSection id="mascot" title="Meet Echo"
        subtitle="The Freestyle mascot. Cream body, olive wave-eyes that mirror the brand mark, ink outline.">
        <DCArtboard id="portrait" label="01 · Portrait" width={900} height={1100}>
          <ArtworkMeetEcho />
        </DCArtboard>
        <DCArtboard id="banner" label="06 · Hero banner (README)" width={1600} height={600}>
          <ArtworkBanner />
        </DCArtboard>
      </DCSection>

      <DCSection id="pieces" title="Artwork pieces"
        subtitle="Six standalone illustrations using Echo. Cause-inspired soft forms, restrained palette.">
        <DCArtboard id="studio" label="02 · Studio session" width={1200} height={800}>
          <ArtworkStudio />
        </DCArtboard>
        <DCArtboard id="silhouette" label="03 · Silhouette" width={800} height={1100}>
          <ArtworkSilhouette />
        </DCArtboard>
        <DCArtboard id="stickers" label="04 · Sticker sheet" width={1200} height={800}>
          <ArtworkStickerSheet />
        </DCArtboard>
        <DCArtboard id="pattern" label="05 · Pattern wall" width={900} height={1100}>
          <ArtworkPattern />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ArtCanvas />);
