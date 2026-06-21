import Phaser from 'phaser';

const config = {
    type: Phaser.AUTO,
    width: 1080,
    height: 1920,
    parent: 'app',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
        default: 'matter',
        matter: {
            debug: true,
            gravity: { y: 1 },
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

function preload() {
    // preload assets here
}

function create() {
    this.add.text(540, 960, 'Game Loading...', { fontSize: '64px', fill: '#fff' }).setOrigin(0.5);
}

function update() {
    // game loop
}
